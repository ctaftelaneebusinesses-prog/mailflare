import type { Branding } from "@/lib/branding/types";
import { CRAFTLANEE_CONFIG } from "@/config/branding";

export const DEFAULT_BRANDING: Branding = {
	appName: CRAFTLANEE_CONFIG.appName,
	hasCustomIcon: false,
	canCustomizeBranding: false,
};

export async function fetchBranding(): Promise<Branding> {
	const response = await fetch("/api/branding", { cache: "no-store" });
	if (!response.ok) return DEFAULT_BRANDING;
	return (await response.json()) as Branding;
}
