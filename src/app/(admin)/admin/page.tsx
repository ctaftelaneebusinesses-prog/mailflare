"use client";

import Link from "next/link";
import { BadgeDollarSign, Bot, Globe2, KeyRound, Mail, Palette, Users } from "@/components/icons";
import { useLanguage } from "@/components/language-provider";
import type { TranslationKey } from "@/lib/i18n/types";
import { AdminUpdateCard } from "@/components/admin-update-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/use-current-user";
import { CraftlaneeDashboard } from "@/components/admin/craftlanee-dashboard";

type AdminSection = {
	href: string;
	titleKey: TranslationKey;
	descriptionKey: TranslationKey;
	icon: typeof Bot;
	permission?: "primary" | "domains" | "users";
};

const sections: AdminSection[] = [
	{
		href: "/agent",
		titleKey: "admin.nav.agent",
		descriptionKey: "admin.section.agent",
		icon: Bot,
		permission: "primary",
	},
	{
		href: "/mailboxes",
		titleKey: "admin.nav.mailboxes",
		descriptionKey: "admin.section.mailboxes",
		icon: Mail,
	},
	{
		href: "/domains",
		titleKey: "admin.nav.domains",
		descriptionKey: "admin.section.domains",
		icon: Globe2,
		permission: "domains",
	},
	{
		href: "/branding",
		titleKey: "admin.nav.branding",
		descriptionKey: "admin.section.branding",
		icon: Palette,
		permission: "primary",
	},
	{
		href: "/licenses",
		titleKey: "admin.nav.licenses",
		descriptionKey: "admin.section.licenses",
		icon: BadgeDollarSign,
		permission: "primary",
	},
	{
		href: "/accounts",
		titleKey: "admin.nav.accounts",
		descriptionKey: "admin.section.accounts",
		icon: Users,
	},
	{
		href: "/api-keys",
		titleKey: "admin.section.apiKeysTitle",
		descriptionKey: "admin.section.apiKeys",
		icon: KeyRound,
		permission: "primary",
	},
];

export default function AdminSettingsPage() {
	const { t } = useLanguage();
	const user = useCurrentUser();

	function canSee(section: AdminSection): boolean {
		if (!section.permission) return true;
		if (!user) return false;
		if (section.permission === "primary") return user.isPrimaryAdmin;
		if (section.permission === "domains") return user.isPrimaryAdmin || user.canManageDomains;
		return user.isPrimaryAdmin || user.canManageUsers;
	}

	return (
		<div className="space-y-10">
			{/* CraftLanee System Metrics & Storage Logs */}
			<CraftlaneeDashboard />

			{/* Administrative Navigation Sections */}
			<div className="space-y-4">
				<div className="border-b border-neutral-800 pb-3">
					<h2 className="text-base font-bold font-mono uppercase tracking-wider text-white">
						Platform Management Modules
					</h2>
					<p className="text-xs text-neutral-400">
						Configure domains, accounts, mailboxes, and platform settings.
					</p>
				</div>

				<div className="grid lg:grid-cols-2 gap-4">
					{sections.filter(canSee).map((section) => {
						const Icon = section.icon;

						return (
							<Link key={section.href} href={section.href}>
								<Card className="h-full rounded-2xl border border-neutral-800 bg-[#0c0c0c] p-5 transition-all hover:border-neutral-600 hover:bg-[#121212]">
									<CardHeader className="flex-row items-center gap-4 space-y-0 py-0">
										<div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-300">
											<Icon className="h-5 w-5" />
										</div>
										<h3 className="text-sm font-semibold font-mono text-white tracking-wide">{t(section.titleKey)}</h3>
									</CardHeader>
									<CardContent className="pt-3">
										<p className="text-xs text-neutral-400">{t(section.descriptionKey)}</p>
									</CardContent>
								</Card>
							</Link>
						);
					})}
				</div>
			</div>

			{user?.isPrimaryAdmin && (
				<div className="pt-2">
					<AdminUpdateCard />
				</div>
			)}
		</div>
	);
}
