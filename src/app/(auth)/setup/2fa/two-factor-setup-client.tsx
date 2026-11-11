"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Copy, Check, KeyRound } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { persistAuthSession } from "@/lib/auth/client";
import { clearCurrentUserCache } from "@/hooks/use-current-user";

interface SetupData {
	secret?: string;
	otpauthUrl?: string;
	qrSvg?: string;
	email: string;
	alreadyEnabled?: boolean;
}

export function TwoFactorSetupClient({ token }: { token?: string }) {
	const router = useRouter();
	const [data, setData] = useState<SetupData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [code, setCode] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
	const [copiedSecret, setCopiedSecret] = useState(false);
	const [copiedCodes, setCopiedCodes] = useState(false);

	useEffect(() => {
		let active = true;
		const query = token ? `?token=${encodeURIComponent(token)}` : "";

		fetch(`/api/auth/mfa/setup${query}`)
			.then(async (res) => {
				if (!res.ok) throw new Error("Could not initialize 2FA setup");
				return res.json() as Promise<SetupData>;
			})
			.then((resData) => {
				if (active) {
					if (resData.alreadyEnabled) {
						clearCurrentUserCache();
						window.location.replace("/admin");
						return;
					}
					setData(resData);
					setLoading(false);
				}
			})
			.catch((err) => {
				if (active) {
					setError(err instanceof Error ? err.message : "Failed to load 2FA");
					setLoading(false);
				}
			});

		return () => {
			active = false;
		};
	}, [token]);

	async function onVerify(e: React.FormEvent) {
		e.preventDefault();
		if (!code || code.length < 6) return;
		setSubmitting(true);
		setError(null);

		try {
			const res = await fetch("/api/auth/mfa/setup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, code }),
			});
			const result = await persistAuthSession(res) as { ok?: boolean; error?: string; recoveryCodes?: string[]; redirect?: string };
			if (!res.ok || !result.ok) {
				setError(result.error ?? "Invalid code. Please try again.");
				setSubmitting(false);
				return;
			}

			clearCurrentUserCache();

			if (result.recoveryCodes && result.recoveryCodes.length > 0) {
				setRecoveryCodes(result.recoveryCodes);
			} else {
				window.location.replace(result.redirect ?? "/admin");
			}
		} catch {
			setError("Failed to connect to authentication server");
		} finally {
			setSubmitting(false);
		}
	}

	function copyToClipboard(text: string, isCodes = false) {
		navigator.clipboard.writeText(text);
		if (isCodes) {
			setCopiedCodes(true);
			setTimeout(() => setCopiedCodes(false), 2000);
		} else {
			setCopiedSecret(true);
			setTimeout(() => setCopiedSecret(false), 2000);
		}
	}

	function onDone() {
		clearCurrentUserCache();
		window.location.replace("/admin");
	}

	return (
		<div className="min-h-screen w-full flex items-center justify-center p-4 bg-black text-white relative overflow-hidden">
			{/* Nothing OS dot-matrix background pattern */}
			<div
				className="absolute inset-0 pointer-events-none opacity-20"
				style={{
					backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
					backgroundSize: "24px 24px",
				}}
			/>

			<div className="relative w-full max-w-md border border-neutral-800 bg-[#0a0a0a] rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
				{/* CraftLanee Header */}
				<div className="space-y-2 text-center">
					<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-neutral-800 bg-neutral-900/60 text-xs font-mono tracking-widest text-neutral-400">
						<span className="h-2 w-2 rounded-full bg-[#D71921] animate-pulse" />
						SECURITY ENFORCEMENT
					</div>
					<h1 className="text-xl sm:text-2xl font-bold tracking-tight font-mono uppercase">
						Admin Two-Factor Setup
					</h1>
					<p className="text-xs text-neutral-400">
						Mandatory TOTP authentication is required for all administrator accounts on CraftLanee.
					</p>
				</div>

				{loading && (
					<div className="py-12 flex flex-col items-center justify-center space-y-3">
						<div className="h-6 w-6 border-2 border-neutral-600 border-t-[#D71921] rounded-full animate-spin" />
						<p className="text-xs font-mono text-neutral-500 uppercase tracking-wider">Generating Secret...</p>
					</div>
				)}

				{error && (
					<div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-xs text-red-300 font-mono">
						{error}
					</div>
				)}

				{!loading && data && !recoveryCodes && data.qrSvg && data.secret && (
					<form onSubmit={onVerify} className="space-y-6">
						{/* Step 1: Scan QR */}
						<div className="space-y-3 text-center">
							<div className="text-xs font-mono text-neutral-400 uppercase tracking-wider">
								Step 1: Scan with Authenticator App
							</div>
							<div className="mx-auto w-44 h-44 rounded-xl border border-neutral-700 bg-white p-2 flex items-center justify-center shadow-inner">
								<div
									className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
									dangerouslySetInnerHTML={{ __html: data.qrSvg }}
								/>
							</div>

							<div className="space-y-1">
								<div className="text-[11px] text-neutral-400">Can't scan? Use this setup key:</div>
								<div className="flex items-center justify-center gap-2">
									<code className="text-xs font-mono bg-neutral-900 border border-neutral-800 px-2 py-1 rounded text-neutral-300 select-all tracking-wider">
										{data.secret}
									</code>
									<button
										type="button"
										onClick={() => data.secret && copyToClipboard(data.secret)}
										className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
										title="Copy secret"
									>
										{copiedSecret ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
									</button>
								</div>
							</div>
						</div>

						{/* Step 2: Enter Code */}
						<div className="space-y-3">
							<div className="text-xs font-mono text-neutral-400 uppercase tracking-wider text-center">
								Step 2: Enter 6-Digit Code
							</div>
							<div className="space-y-1">
								<Input
									id="totp-code"
									type="text"
									inputMode="numeric"
									autoComplete="one-time-code"
									placeholder="000 000"
									maxLength={7}
									value={code}
									onChange={(e) => setCode(e.target.value.replace(/[^0-9\s]/g, ""))}
									className="h-12 text-center text-xl font-mono tracking-[0.3em] bg-neutral-900/80 border-neutral-800 focus:border-[#D71921] focus:ring-[#D71921]"
									required
									autoFocus
								/>
							</div>

							<Button
								type="submit"
								disabled={submitting || code.replace(/\s+/g, "").length < 6}
								className="w-full h-11 bg-[#D71921] hover:bg-[#b5141b] text-white font-mono uppercase tracking-wider text-xs font-semibold rounded-lg transition-all"
							>
								{submitting ? "Verifying..." : "Verify & Enforce 2FA"}
							</Button>
						</div>
					</form>
				)}

				{recoveryCodes && (
					<div className="space-y-5">
						<div className="space-y-2 text-center">
							<div className="inline-flex p-2 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800">
								<ShieldCheck className="w-6 h-6" />
							</div>
							<h2 className="text-base font-bold font-mono uppercase">2FA Successfully Enabled</h2>
							<p className="text-xs text-neutral-400">
								Save these single-use recovery codes in a secure place. If you lose your device, these are the only way to recover access.
							</p>
						</div>

						<div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 font-mono text-xs text-neutral-200 grid grid-cols-2 gap-2 select-all">
							{recoveryCodes.map((c, i) => (
								<div key={i} className="text-center py-0.5 bg-black/40 rounded border border-neutral-800/80">
									{c}
								</div>
							))}
						</div>

						<div className="flex gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => copyToClipboard(recoveryCodes.join("\n"), true)}
								className="flex-1 border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 text-xs font-mono"
							>
								{copiedCodes ? "Copied!" : "Copy Codes"}
							</Button>
							<Button
								type="button"
								onClick={onDone}
								className="flex-1 bg-[#D71921] hover:bg-[#b5141b] text-white text-xs font-mono uppercase"
							>
								Continue to Dashboard
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
