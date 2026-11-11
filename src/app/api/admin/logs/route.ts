import { NextResponse } from "next/server";
import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { messages, messageAttachments, users } from "@/db/schema";
import { getEnv } from "@/lib/cloudflare";
import { requireSessionUser } from "@/lib/api/auth";
import { isPrimaryAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) return auth.error;
	if (!isPrimaryAdmin(auth.user)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const url = new URL(request.url);
	const startDate = url.searchParams.get("startDate");
	const endDate = url.searchParams.get("endDate");
	const direction = url.searchParams.get("direction"); // inbound, outbound, or null (all)
	const status = url.searchParams.get("status"); // sent, received, failed, etc.
	const search = url.searchParams.get("search")?.trim();
	const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
	const limit = Math.min(50, Math.max(10, parseInt(url.searchParams.get("limit") ?? "20", 10)));
	const offset = (page - 1) * limit;

	const db = getDb(env);

	const conditions = [];

	if (startDate) {
		conditions.push(gte(messages.createdAt, new Date(startDate)));
	}
	if (endDate) {
		// Include until end of day if only YYYY-MM-DD
		const end = new Date(endDate);
		if (endDate.length === 10) {
			end.setHours(23, 59, 59, 999);
		}
		conditions.push(lte(messages.createdAt, end));
	}
	if (direction && (direction === "inbound" || direction === "outbound")) {
		conditions.push(eq(messages.direction, direction));
	}
	if (status) {
		conditions.push(eq(messages.status, status));
	}
	if (search) {
		const searchPattern = `%${search}%`;
		conditions.push(
			or(
				like(messages.fromAddr, searchPattern),
				like(messages.toAddr, searchPattern),
				like(messages.subject, searchPattern),
			),
		);
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const [totalResult] = await db
		.select({ count: sql<number>`count(*)` })
		.from(messages)
		.where(whereClause);

	const total = Number(totalResult?.count ?? 0);

	const rows = await db
		.select({
			id: messages.id,
			direction: messages.direction,
			from: messages.fromAddr,
			to: messages.toAddr,
			subject: messages.subject,
			snippet: messages.snippet,
			status: messages.status,
			providerMessageId: messages.providerMessageId,
			createdAt: messages.createdAt,
			hasAttachments: sql<number>`(SELECT count(*) FROM ${messageAttachments} WHERE ${messageAttachments.messageId} = ${messages.id})`,
			totalAttachmentSize: sql<number>`coalesce((SELECT sum(${messageAttachments.size}) FROM ${messageAttachments} WHERE ${messageAttachments.messageId} = ${messages.id}), 0)`,
		})
		.from(messages)
		.where(whereClause)
		.orderBy(desc(messages.createdAt))
		.limit(limit)
		.offset(offset);

	return NextResponse.json({
		logs: rows.map((row) => ({
			...row,
			createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
			hasAttachments: Number(row.hasAttachments) > 0,
			totalAttachmentSize: Number(row.totalAttachmentSize),
		})),
		pagination: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		},
	}, {
		headers: { "Cache-Control": "no-store" },
	});
}
