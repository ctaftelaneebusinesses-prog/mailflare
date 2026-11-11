import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { requireSessionUser } from "@/lib/api/auth";
import { isPrimaryAdmin } from "@/lib/auth/admin";
import { getStorageUsage, runStorageAutoClean } from "@/lib/storage/volume-retention";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) return auth.error;
	if (!isPrimaryAdmin(auth.user)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const usage = await getStorageUsage(env);
	return NextResponse.json(usage, {
		headers: { "Cache-Control": "no-store" },
	});
}

export async function POST(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) return auth.error;
	if (!isPrimaryAdmin(auth.user)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const result = await runStorageAutoClean(env);
	return NextResponse.json({ ok: true, result }, {
		headers: { "Cache-Control": "no-store" },
	});
}
