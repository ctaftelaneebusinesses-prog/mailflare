import { and, asc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { driveItems, messageAttachments, messages, users } from "@/db/schema";
import { permanentlyDeleteMessages } from "@/lib/email/permanent-delete";
import { sweepOrphanedRawMail } from "@/lib/email/raw-sweeper";

/** Cloudflare Free Tier hard cap for R2 Storage: 10 GB */
export const STORAGE_HARD_CAP_BYTES = 10 * 1024 * 1024 * 1024; // 10,737,418,240 bytes (10 GB)

/** Threshold to trigger auto-cleaning before hitting limits: 9.5 GB */
export const STORAGE_WARNING_BYTES = 9.5 * 1024 * 1024 * 1024; // 10,200,547,328 bytes (9.5 GB)

/** Configurable age threshold: 30 days */
export const DEFAULT_RETENTION_DAYS = 30;

/** Estimated average byte size of a raw MIME email headers & text body in R2 */
const ESTIMATED_RAW_MIME_BYTES = 30 * 1024; // 30 KB

export interface StorageUsageReport {
	totalBytes: number;
	attachmentBytes: number;
	driveBytes: number;
	rawEmailBytes: number;
	limitBytes: number;
	warningBytes: number;
	usagePercentage: number;
	isApproachingWarning: boolean;
	isExceeded: boolean;
	countMessages: number;
	countAttachments: number;
	countDriveItems: number;
}

/**
 * Calculates the total storage consumed across email attachments, drive files, and raw MIME messages.
 */
export async function getStorageUsage(env: CloudflareEnv): Promise<StorageUsageReport> {
	const db = getDb(env);

	const [attachmentUsage] = await db
		.select({
			bytes: sql<number>`coalesce(sum(${messageAttachments.size}), 0)`,
			count: sql<number>`count(*)`,
		})
		.from(messageAttachments);

	const [driveUsage] = await db
		.select({
			bytes: sql<number>`coalesce(sum(${driveItems.size}), 0)`,
			count: sql<number>`count(*)`,
		})
		.from(driveItems);

	const [messageUsage] = await db
		.select({
			countWithRaw: sql<number>`count(case when ${messages.rawR2Key} is not null then 1 end)`,
			totalMessages: sql<number>`count(*)`,
		})
		.from(messages);

	const attachmentBytes = Number(attachmentUsage?.bytes ?? 0);
	const countAttachments = Number(attachmentUsage?.count ?? 0);

	const driveBytes = Number(driveUsage?.bytes ?? 0);
	const countDriveItems = Number(driveUsage?.count ?? 0);

	const rawMessageCount = Number(messageUsage?.countWithRaw ?? 0);
	const countMessages = Number(messageUsage?.totalMessages ?? 0);
	const rawEmailBytes = rawMessageCount * ESTIMATED_RAW_MIME_BYTES;

	const totalBytes = attachmentBytes + driveBytes + rawEmailBytes;
	const usagePercentage = Math.min(100, Math.round((totalBytes / STORAGE_HARD_CAP_BYTES) * 10000) / 100);

	return {
		totalBytes,
		attachmentBytes,
		driveBytes,
		rawEmailBytes,
		limitBytes: STORAGE_HARD_CAP_BYTES,
		warningBytes: STORAGE_WARNING_BYTES,
		usagePercentage,
		isApproachingWarning: totalBytes >= STORAGE_WARNING_BYTES,
		isExceeded: totalBytes >= STORAGE_HARD_CAP_BYTES,
		countMessages,
		countAttachments,
		countDriveItems,
	};
}

/**
 * Check whether an incoming email can be accepted or if storage limits require rejection.
 * Rejects large attachments or whole emails when near or exceeding 10 GB limit.
 */
export async function checkStorageQuotaForInbound(
	env: CloudflareEnv,
	incomingBytes = 0,
): Promise<{ allowed: boolean; reason?: string }> {
	const usage = await getStorageUsage(env);

	// If hard cap reached or will be exceeded by incoming payload
	if (usage.isExceeded || (usage.totalBytes + incomingBytes) >= STORAGE_HARD_CAP_BYTES) {
		return {
			allowed: false,
			reason: "552 5.2.2 Mailbox storage quota exceeded (10 GB Cloudflare Free Tier cap reached). Incoming large message bounced.",
		};
	}

	return { allowed: true };
}

/**
 * Scheduled auto-cleaning routine:
 * 1. Purges emails older than retentionDays (default: 30 days).
 * 2. If storage approaches 9.5 GB, deletes oldest emails progressively until below 9.5 GB.
 * 3. Sweeps orphaned raw MIME files from R2.
 */
export async function runStorageAutoClean(
	env: CloudflareEnv,
	now = new Date(),
	retentionDays = DEFAULT_RETENTION_DAYS,
): Promise<{
	agePurged: number;
	volumePurged: number;
	orphansRemoved: number;
	usageBefore: StorageUsageReport;
	usageAfter: StorageUsageReport;
}> {
	const db = getDb(env);
	const usageBefore = await getStorageUsage(env);

	// Get system admin user id for audit logging
	const [admin] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.role, "admin"))
		.limit(1);
	const actorUserId = admin?.id ?? "system";

	let agePurged = 0;
	let volumePurged = 0;

	// Phase 1: Delete emails older than retentionDays (e.g. 30 days)
	const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
	const expiredMessages = await db
		.select({
			id: messages.id,
			mailboxId: messages.mailboxId,
			rawR2Key: messages.rawR2Key,
			status: messages.status,
		})
		.from(messages)
		.where(lt(messages.createdAt, cutoff))
		.limit(100);

	if (expiredMessages.length > 0) {
		agePurged = await permanentlyDeleteMessages(env, db, actorUserId, expiredMessages, "retention");
	}

	// Phase 2: If total storage approaches 9.5 GB, delete oldest emails until below 9.5 GB
	let currentUsage = await getStorageUsage(env);
	while (currentUsage.totalBytes >= STORAGE_WARNING_BYTES) {
		const oldestBatch = await db
			.select({
				id: messages.id,
				mailboxId: messages.mailboxId,
				rawR2Key: messages.rawR2Key,
				status: messages.status,
			})
			.from(messages)
			.orderBy(asc(messages.createdAt))
			.limit(50);

		if (oldestBatch.length === 0) break;

		const deletedCount = await permanentlyDeleteMessages(env, db, actorUserId, oldestBatch, "retention");
		volumePurged += deletedCount;

		currentUsage = await getStorageUsage(env);
		if (deletedCount < 50) break; // No more messages available to delete
	}

	// Phase 3: Sweep orphaned raw mail from R2 bucket
	let orphansRemoved = 0;
	try {
		orphansRemoved = await sweepOrphanedRawMail(env, now);
	} catch (err) {
		console.error("Storage auto-clean orphan sweep error:", err);
	}

	const usageAfter = await getStorageUsage(env);

	console.log(`[Storage Auto-Clean] Completed: ${agePurged} expired messages purged, ${volumePurged} volume-cap messages purged, ${orphansRemoved} raw orphans removed. Usage: ${(usageAfter.totalBytes / (1024 ** 3)).toFixed(2)} GB / 10 GB.`);

	return {
		agePurged,
		volumePurged,
		orphansRemoved,
		usageBefore,
		usageAfter,
	};
}
