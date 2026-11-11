"use client";

import { useEffect, useState, useMemo } from "react";
import { 
	Database, 
	HardDrive, 
	Mail, 
	Send, 
	Inbox, 
	CheckCircle2, 
	AlertTriangle, 
	Trash2, 
	RefreshCw, 
	CalendarDays as CalendarIcon, 
	Search, 
	ChevronLeft, 
	ChevronRight,
	ExternalLink
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CRAFTLANEE_CONFIG } from "@/config/branding";

interface StorageReport {
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

interface EmailLogItem {
	id: string;
	direction: "inbound" | "outbound";
	from: string;
	to: string;
	subject: string | null;
	snippet: string | null;
	status: string;
	providerMessageId: string | null;
	createdAt: string | null;
	hasAttachments: boolean;
	totalAttachmentSize: number;
}

interface PaginationInfo {
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function CraftlaneeDashboard() {
	// Storage state
	const [storage, setStorage] = useState<StorageReport | null>(null);
	const [storageLoading, setStorageLoading] = useState(true);
	const [cleanBusy, setCleanBusy] = useState(false);
	const [cleanMessage, setCleanMessage] = useState<string | null>(null);

	// Logs state
	const [logs, setLogs] = useState<EmailLogItem[]>([]);
	const [logsLoading, setLogsLoading] = useState(true);
	const [pagination, setPagination] = useState<PaginationInfo>({ total: 0, page: 1, limit: 15, totalPages: 1 });

	// Filter state
	const [direction, setDirection] = useState<string>("");
	const [statusFilter, setStatusFilter] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState<string>("");
	const [startDate, setStartDate] = useState<string>("");
	const [endDate, setEndDate] = useState<string>("");
	const [datePreset, setDatePreset] = useState<string>("all");

	// Load storage metrics
	const fetchStorageMetrics = async () => {
		try {
			setStorageLoading(true);
			const res = await fetch("/api/admin/storage/metrics");
			if (res.ok) {
				const data = await res.json() as StorageReport;
				setStorage(data);
			}
		} catch (err) {
			console.error("Storage load error:", err);
		} finally {
			setStorageLoading(false);
		}
	};

	// Load email logs
	const fetchLogs = async (page = 1) => {
		try {
			setLogsLoading(true);
			const params = new URLSearchParams();
			params.set("page", page.toString());
			params.set("limit", "15");
			if (direction) params.set("direction", direction);
			if (statusFilter) params.set("status", statusFilter);
			if (searchQuery.trim()) params.set("search", searchQuery.trim());
			if (startDate) params.set("startDate", startDate);
			if (endDate) params.set("endDate", endDate);

			const res = await fetch(`/api/admin/logs?${params.toString()}`);
			if (res.ok) {
				const data = await res.json() as { logs: EmailLogItem[]; pagination: PaginationInfo };
				setLogs(data.logs);
				setPagination(data.pagination);
			}
		} catch (err) {
			console.error("Logs load error:", err);
		} finally {
			setLogsLoading(false);
		}
	};

	useEffect(() => {
		void fetchStorageMetrics();
		void fetchLogs(1);
	}, []);

	// Handle Date Preset Click
	const handleDatePreset = (preset: string) => {
		setDatePreset(preset);
		const now = new Date();

		if (preset === "today") {
			const todayStr = now.toISOString().split("T")[0];
			setStartDate(todayStr);
			setEndDate(todayStr);
		} else if (preset === "7days") {
			const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			setStartDate(past.toISOString().split("T")[0]);
			setEndDate(now.toISOString().split("T")[0]);
		} else if (preset === "30days") {
			const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			setStartDate(past.toISOString().split("T")[0]);
			setEndDate(now.toISOString().split("T")[0]);
		} else {
			setStartDate("");
			setEndDate("");
		}
	};

	const applyFilter = (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		void fetchLogs(1);
	};

	const triggerAutoClean = async () => {
		setCleanBusy(true);
		setCleanMessage(null);
		try {
			const res = await fetch("/api/admin/storage/metrics", { method: "POST" });
			const result = await res.json() as { ok?: boolean; result?: { agePurged: number; volumePurged: number; orphansRemoved: number } };
			if (result.ok && result.result) {
				const { agePurged, volumePurged, orphansRemoved } = result.result;
				setCleanMessage(`Cleaned: ${agePurged} expired, ${volumePurged} volume-cap items, ${orphansRemoved} raw orphans removed.`);
				await fetchStorageMetrics();
				await fetchLogs(1);
			} else {
				setCleanMessage("Auto-cleaning completed (no items required purge).");
			}
		} catch {
			setCleanMessage("Failed to execute auto-cleaning.");
		} finally {
			setCleanBusy(false);
		}
	};

	const usageGb = storage ? (storage.totalBytes / (1024 ** 3)).toFixed(2) : "0.00";
	const limitGb = (CRAFTLANEE_CONFIG.storage.hardCapGb).toFixed(1);
	const warningGb = (CRAFTLANEE_CONFIG.storage.warningCapGb).toFixed(1);
	const progressPercent = storage ? Math.min(100, Math.max(0.5, storage.usagePercentage)) : 0;

	return (
		<div className="space-y-8">
			{/* Nothing OS Aesthetic Header */}
			<div className="border border-neutral-800 bg-[#080808] rounded-2xl p-6 relative overflow-hidden">
				<div 
					className="absolute inset-0 pointer-events-none opacity-10"
					style={{
						backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
						backgroundSize: "20px 20px"
					}}
				/>

				<div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<span className="craftlanee-led" />
							<span className="text-xs font-mono tracking-widest text-neutral-400 uppercase">
								SYSTEM OPERATIONAL
							</span>
						</div>
						<h1 className="text-2xl md:text-3xl font-bold font-mono tracking-wider text-white uppercase">
							{CRAFTLANEE_CONFIG.appName} Architecture
						</h1>
						<p className="text-xs text-neutral-400">
							{CRAFTLANEE_CONFIG.tagline} • Cloudflare Ecosystem (Workers / D1 / R2)
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-3 font-mono text-xs">
						<div className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900/80 text-neutral-300 flex items-center gap-2">
							<span className="h-2 w-2 rounded-full bg-emerald-400" />
							RESEND OUTBOUND: ACTIVE
						</div>
						<div className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900/80 text-neutral-300 flex items-center gap-2">
							<span className="h-2 w-2 rounded-full bg-[#D71921]" />
							2FA TOTP: ENFORCED
						</div>
					</div>
				</div>
			</div>

			{/* Storage Volume & Free Tier Guardrails */}
			<div className="border border-neutral-800 bg-[#0a0a0a] rounded-2xl p-6 space-y-6">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<HardDrive className="w-5 h-5 text-[#D71921]" />
							<h2 className="text-lg font-bold font-mono tracking-wider text-white uppercase">
								Storage Management & Free Tier Limits
							</h2>
						</div>
						<p className="text-xs text-neutral-400">
							R2 & D1 Storage Hard Cap: 10 GB • Auto-cleaning threshold: 9.5 GB • Retention: 30 days
						</p>
					</div>

					<Button
						type="button"
						onClick={triggerAutoClean}
						disabled={cleanBusy}
						variant="outline"
						className="border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-mono tracking-wider uppercase h-9"
					>
						<RefreshCw className={`w-3.5 h-3.5 mr-2 ${cleanBusy ? "animate-spin" : ""}`} />
						{cleanBusy ? "Cleaning..." : "Run Auto-Clean"}
					</Button>
				</div>

				{cleanMessage && (
					<div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-300">
						{cleanMessage}
					</div>
				)}

				{/* Storage Progress Bar */}
				<div className="space-y-2">
					<div className="flex justify-between text-xs font-mono">
						<span className="text-neutral-400">
							USED: <strong className="text-white">{usageGb} GB</strong> / {limitGb} GB ({storage ? storage.usagePercentage : 0}%)
						</span>
						<span className="text-neutral-400">
							WARNING TRIGGER: <strong className="text-[#D71921]">{warningGb} GB</strong>
						</span>
					</div>

					<div className="h-3.5 w-full bg-neutral-900 rounded-full border border-neutral-800 overflow-hidden relative">
						<div
							className="h-full bg-gradient-to-r from-neutral-200 via-neutral-100 to-[#D71921] transition-all duration-500 rounded-full"
							style={{ width: `${progressPercent}%` }}
						/>
						{/* 95% warning marker line */}
						<div 
							className="absolute top-0 bottom-0 w-0.5 bg-[#D71921] opacity-70"
							style={{ left: "95%" }}
							title="9.5 GB Auto-clean Threshold"
						/>
					</div>

					<div className="flex justify-between text-[11px] font-mono text-neutral-500">
						<span>0 GB</span>
						<span>9.5 GB (Auto-Purge Trigger)</span>
						<span>10.0 GB (Hard Cap)</span>
					</div>
				</div>

				{/* Metrics Grid */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
					<div className="p-4 rounded-xl border border-neutral-800/80 bg-neutral-900/50 space-y-1">
						<div className="text-[11px] font-mono text-neutral-400 uppercase">Attachments</div>
						<div className="text-lg font-bold font-mono text-white">
							{storage ? formatBytes(storage.attachmentBytes) : "..."}
						</div>
						<div className="text-[11px] text-neutral-400 font-mono">
							{storage ? `${storage.countAttachments} files` : "..."}
						</div>
					</div>

					<div className="p-4 rounded-xl border border-neutral-800/80 bg-neutral-900/50 space-y-1">
						<div className="text-[11px] font-mono text-neutral-400 uppercase">Drive Files</div>
						<div className="text-lg font-bold font-mono text-white">
							{storage ? formatBytes(storage.driveBytes) : "..."}
						</div>
						<div className="text-[11px] text-neutral-400 font-mono">
							{storage ? `${storage.countDriveItems} items` : "..."}
						</div>
					</div>

					<div className="p-4 rounded-xl border border-neutral-800/80 bg-neutral-900/50 space-y-1">
						<div className="text-[11px] font-mono text-neutral-400 uppercase">Raw Email Storage</div>
						<div className="text-lg font-bold font-mono text-white">
							{storage ? formatBytes(storage.rawEmailBytes) : "..."}
						</div>
						<div className="text-[11px] text-neutral-400 font-mono">
							{storage ? `${storage.countMessages} messages` : "..."}
						</div>
					</div>

					<div className="p-4 rounded-xl border border-neutral-800/80 bg-neutral-900/50 space-y-1">
						<div className="text-[11px] font-mono text-neutral-400 uppercase">Auto-Clean Schedule</div>
						<div className="text-lg font-bold font-mono text-[#D71921]">
							DAILY 02:00
						</div>
						<div className="text-[11px] text-neutral-400 font-mono">
							Cron Trigger Active
						</div>
					</div>
				</div>
			</div>

			{/* Interactive Email Logs & Material 3 Calendar Filter */}
			<div className="border border-neutral-800 bg-[#0a0a0a] rounded-2xl p-6 space-y-6">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<Mail className="w-5 h-5 text-neutral-300" />
						<h2 className="text-lg font-bold font-mono tracking-wider text-white uppercase">
							Email Traffic & Delivery Logs
						</h2>
					</div>
					<p className="text-xs text-neutral-400">
						Real-time audit log of inbound and outbound email messages dispatched via Resend API
					</p>
				</div>

				{/* Filter & Date Bar */}
				<form onSubmit={applyFilter} className="space-y-4">
					{/* Quick Date Presets */}
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-xs font-mono text-neutral-400 uppercase mr-1">Range:</span>
						{[
							{ id: "all", label: "ALL TIME" },
							{ id: "today", label: "TODAY" },
							{ id: "7days", label: "LAST 7 DAYS" },
							{ id: "30days", label: "LAST 30 DAYS" },
						].map((preset) => (
							<button
								key={preset.id}
								type="button"
								onClick={() => handleDatePreset(preset.id)}
								className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
									datePreset === preset.id
										? "bg-white text-black font-semibold"
										: "bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white"
								}`}
							>
								{preset.label}
							</button>
						))}
					</div>

					{/* Material 3 Styled Input Controls */}
					<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
						{/* Start Date */}
						<div>
							<label className="text-[11px] font-mono text-neutral-400 block mb-1 uppercase">Start Date</label>
							<Input
								type="date"
								value={startDate}
								onChange={(e) => { setStartDate(e.target.value); setDatePreset("custom"); }}
								className="h-9 bg-neutral-900 border-neutral-800 text-white text-xs font-mono"
							/>
						</div>

						{/* End Date */}
						<div>
							<label className="text-[11px] font-mono text-neutral-400 block mb-1 uppercase">End Date</label>
							<Input
								type="date"
								value={endDate}
								onChange={(e) => { setEndDate(e.target.value); setDatePreset("custom"); }}
								className="h-9 bg-neutral-900 border-neutral-800 text-white text-xs font-mono"
							/>
						</div>

						{/* Direction */}
						<div>
							<label className="text-[11px] font-mono text-neutral-400 block mb-1 uppercase">Direction</label>
							<select
								value={direction}
								onChange={(e) => setDirection(e.target.value)}
								className="h-9 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#D71921]"
							>
								<option value="">ALL DIRECTIONS</option>
								<option value="inbound">INBOUND</option>
								<option value="outbound">OUTBOUND (RESEND)</option>
							</select>
						</div>

						{/* Search Input */}
						<div className="md:col-span-2 flex items-end gap-2">
							<div className="flex-1">
								<label className="text-[11px] font-mono text-neutral-400 block mb-1 uppercase">Search</label>
								<div className="relative">
									<Search className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-500" />
									<Input
										type="text"
										placeholder="Filter by subject or address..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="h-9 pl-8 bg-neutral-900 border-neutral-800 text-white text-xs font-mono"
									/>
								</div>
							</div>
							<Button
								type="submit"
								className="h-9 bg-[#D71921] hover:bg-[#b5141b] text-white text-xs font-mono uppercase tracking-wider px-4"
							>
								Filter
							</Button>
						</div>
					</div>
				</form>

				{/* Data Table */}
				<div className="rounded-xl border border-neutral-800 bg-black overflow-hidden">
					<div className="overflow-x-auto">
						<table className="w-full text-left text-xs font-mono">
							<thead className="border-b border-neutral-800 bg-neutral-900/60 text-neutral-400 uppercase text-[11px]">
								<tr>
									<th className="px-4 py-3">Type</th>
									<th className="px-4 py-3">Status</th>
									<th className="px-4 py-3">Sender / Recipient</th>
									<th className="px-4 py-3">Subject</th>
									<th className="px-4 py-3">Provider ID</th>
									<th className="px-4 py-3 text-right">Timestamp</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-neutral-800/80 text-neutral-300">
								{logsLoading && (
									<tr>
										<td colSpan={6} className="text-center py-10 text-neutral-500">
											<div className="h-4 w-4 border-2 border-neutral-600 border-t-[#D71921] rounded-full animate-spin mx-auto mb-2" />
											Loading email logs...
										</td>
									</tr>
								)}

								{!logsLoading && logs.length === 0 && (
									<tr>
										<td colSpan={6} className="text-center py-12 text-neutral-500">
											No email logs found matching criteria.
										</td>
									</tr>
								)}

								{!logsLoading && logs.map((log) => (
									<tr key={log.id} className="hover:bg-neutral-900/40 transition-colors">
										<td className="px-4 py-3">
											{log.direction === "outbound" ? (
												<span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-neutral-800 bg-neutral-900 text-neutral-300 text-[10px]">
													<Send className="w-3 h-3 text-[#D71921]" />
													OUTBOUND
												</span>
											) : (
												<span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-neutral-800 bg-neutral-900 text-neutral-300 text-[10px]">
													<Inbox className="w-3 h-3 text-blue-400" />
													INBOUND
												</span>
											)}
										</td>
										<td className="px-4 py-3">
											{log.status === "sent" ? (
												<span className="text-emerald-400 inline-flex items-center gap-1">
													<CheckCircle2 className="w-3 h-3" />
													SENT
												</span>
											) : log.status === "received" ? (
												<span className="text-blue-400">RECEIVED</span>
											) : log.status === "failed" ? (
												<span className="text-red-400 inline-flex items-center gap-1">
													<AlertTriangle className="w-3 h-3" />
													FAILED
												</span>
											) : (
												<span className="text-neutral-400 uppercase">{log.status}</span>
											)}
										</td>
										<td className="px-4 py-3 max-w-[200px] truncate" title={`${log.from} → ${log.to}`}>
											<div className="text-white truncate">{log.direction === "outbound" ? log.to : log.from}</div>
											<div className="text-[10px] text-neutral-500 truncate">
												{log.direction === "outbound" ? `from: ${log.from}` : `to: ${log.to}`}
											</div>
										</td>
										<td className="px-4 py-3 max-w-[240px] truncate">
											<div className="text-white truncate font-sans text-xs">
												{log.subject || "(No Subject)"}
											</div>
											{log.hasAttachments && (
												<span className="text-[10px] text-neutral-400 inline-flex items-center gap-1">
													📎 {formatBytes(log.totalAttachmentSize)}
												</span>
											)}
										</td>
										<td className="px-4 py-3">
											{log.providerMessageId ? (
												<code className="text-[11px] bg-neutral-900 px-1.5 py-0.5 rounded text-neutral-400">
													{log.providerMessageId.slice(0, 16)}...
												</code>
											) : (
												<span className="text-neutral-600">—</span>
											)}
										</td>
										<td className="px-4 py-3 text-right text-neutral-400">
											{log.createdAt ? new Date(log.createdAt).toLocaleString(undefined, {
												month: "short",
												day: "numeric",
												hour: "2-digit",
												minute: "2-digit",
											}) : "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* Pagination Footer */}
					<div className="border-t border-neutral-800 bg-neutral-900/40 px-4 py-3 flex items-center justify-between text-xs font-mono text-neutral-400">
						<div>
							Total: <strong className="text-white">{pagination.total}</strong> records
						</div>
						<div className="flex items-center gap-2">
							<span>Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={pagination.page <= 1 || logsLoading}
								onClick={() => void fetchLogs(pagination.page - 1)}
								className="h-7 w-7 p-0 border-neutral-800 bg-neutral-900 text-white"
							>
								<ChevronLeft className="w-3.5 h-3.5" />
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={pagination.page >= pagination.totalPages || logsLoading}
								onClick={() => void fetchLogs(pagination.page + 1)}
								className="h-7 w-7 p-0 border-neutral-800 bg-neutral-900 text-white"
							>
								<ChevronRight className="w-3.5 h-3.5" />
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
