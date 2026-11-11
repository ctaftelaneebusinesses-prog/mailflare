import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getEnv } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/cookies";
import { consumeLoginChallenge, getLoginChallengeUserId } from "@/lib/auth/login-challenge";
import { completeLogin } from "@/lib/auth/login-response";
import { buildOtpauthUrl, generateTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { issueRecoveryCodes } from "@/lib/auth/recovery-codes";
import { getBranding } from "@/lib/branding/service";
import { readJsonBody } from "@/lib/http/request";

export const dynamic = "force-dynamic";

/**
 * Returns QR code SVG and TOTP secret for setting up 2FA.
 * Can be accessed using an active session or a login challengeToken (for first login setup).
 */
export async function GET(request: Request) {
	const env = getEnv();
	const url = new URL(request.url);
	const token = url.searchParams.get("token");

	let targetUser: typeof users.$inferSelect | null = null;
	const db = getDb(env);

	if (token) {
		const userId = await getLoginChallengeUserId(env, token);
		if (userId) {
			const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
			targetUser = u ?? null;
		}
	}

	if (!targetUser) {
		const sessionUser = await getCurrentUser(env, request);
		if (sessionUser) {
			const [u] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
			targetUser = u ?? null;
		}
	}

	if (!targetUser) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// If the user already completed 2FA setup, do not regenerate or reset
	if (targetUser.totpEnabled && targetUser.totpSecret) {
		return NextResponse.json({
			alreadyEnabled: true,
			email: targetUser.email,
		}, {
			headers: { "Cache-Control": "no-store" },
		});
	}

	// Keep existing secret unless missing or explicitly asked to regenerate
	let secret = targetUser.totpSecret;
	if (!secret || url.searchParams.has("regenerate")) {
		secret = generateTotpSecret();
		await db
			.update(users)
			.set({ totpSecret: secret })
			.where(eq(users.id, targetUser.id));
	}

	const { appName } = await getBranding(env);
	const otpauthUrl = buildOtpauthUrl({
		issuer: appName || "CraftLanee",
		account: targetUser.email,
		secret,
	});

	const qrSvg = await QRCode.toString(otpauthUrl, {
		type: "svg",
		margin: 1,
		errorCorrectionLevel: "M",
	});

	return NextResponse.json({
		secret,
		otpauthUrl,
		qrSvg,
		email: targetUser.email,
	}, {
		headers: { "Cache-Control": "no-store" },
	});
}

/**
 * Confirms 2FA setup by verifying a 6-digit TOTP code.
 * Upon success, enables TOTP, generates recovery codes, and completes login.
 */
export async function POST(request: Request) {
	const env = getEnv();
	const body = await readJsonBody(request, 16 * 1024).catch(() => null) as {
		token?: string;
		code?: string;
	} | null;

	if (!body || !body.code) {
		return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
	}

	const code = body.code.replace(/\s+/g, "");
	if (!/^\d{6}$/.test(code)) {
		return NextResponse.json({ error: "Code must be 6 digits" }, { status: 400 });
	}

	const db = getDb(env);
	let targetUser: typeof users.$inferSelect | null = null;
	const isChallenge = Boolean(body.token);

	if (body.token) {
		const userId = await getLoginChallengeUserId(env, body.token);
		if (userId) {
			const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
			targetUser = u ?? null;
		}
	}

	if (!targetUser) {
		const sessionUser = await getCurrentUser(env, request);
		if (sessionUser) {
			const [u] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
			targetUser = u ?? null;
		}
	}

	if (!targetUser || !targetUser.totpSecret) {
		return NextResponse.json({ error: "Enrolment expired or not started" }, { status: 401 });
	}

	const matched = await verifyTotp(targetUser.totpSecret, code);
	if (!matched) {
		return NextResponse.json({ error: "Invalid verification code. Please check your authenticator app time." }, { status: 400 });
	}

	// Code matched! Activate TOTP and require second factor
	await db
		.update(users)
		.set({
			totpEnabled: true,
			totpConfirmedAt: new Date(),
			requireSecondFactor: true,
		})
		.where(eq(users.id, targetUser.id));

	const recoveryCodes = await issueRecoveryCodes(env, targetUser.id);

	if (body.token) {
		await consumeLoginChallenge(env, body.token);
	}

	// Always complete login: sets session cookie, returns bearer token and recovery codes
	const response = await completeLogin(env, request, targetUser.id, {
		body: {
			ok: true,
			recoveryCodes,
			redirect: targetUser.role === "admin" ? "/admin" : "/inbox",
		},
	});
	return response;
}
