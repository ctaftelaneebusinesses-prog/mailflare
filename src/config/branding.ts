/**
 * CraftLanee Design System & Configuration
 * 
 * You can customize the look and feel, colors, fonts, logo paths, and storage
 * limits by editing this configuration file or setting the corresponding
 * environment variables in your Cloudflare Worker or .env file.
 */

export const CRAFTLANEE_CONFIG = {
	appName: process.env.NEXT_PUBLIC_APP_NAME || "CraftLanee",
	tagline: "Minimalist Multi-Tenant Email & Cloud Storage",
	
	// Asset paths
	logoPath: process.env.NEXT_PUBLIC_LOGO_PATH || "/craftlanee-logo.svg",
	iconPath: process.env.NEXT_PUBLIC_ICON_PATH || "/craftlanee-icon.svg",
	
	// Nothing OS-inspired Color Palette (Deep Blacks, Stark Whites, Subtle Red Accent)
	colors: {
		// Monochrome Base
		black: "#000000",
		darkBackground: "#050505",
		cardBackground: "#0c0c0c",
		surface: "#141414",
		surfaceMuted: "#1a1a1a",
		border: "#242424",
		borderHover: "#383838",
		white: "#ffffff",
		textMuted: "#888888",
		textFaint: "#555555",
		
		// Signature Nothing OS Red Accent
		accentRed: process.env.NEXT_PUBLIC_ACCENT_RED || "#D71921",
		accentRedHover: "#b5141b",
		accentRedMuted: "rgba(215, 25, 33, 0.15)",
		accentRedGlow: "rgba(215, 25, 33, 0.35)",
		
		// Grid and dot matrix guides
		dotMatrixGrid: "rgba(255, 255, 255, 0.08)",
	},

	// Typography configuration
	typography: {
		dotMatrixFont: "'Silkscreen', 'Space Mono', monospace",
		sansFont: "var(--font-geist-sans), system-ui, sans-serif",
		monoFont: "var(--font-geist-mono), monospace",
	},

	// Storage Management Thresholds (Free Tier Guardrails)
	storage: {
		hardCapGb: 10.0, // Hard limit before bouncing incoming messages
		warningCapGb: 9.5, // Auto-cleaning trigger threshold
		defaultRetentionDays: 30, // Age threshold for cleaning old emails
	},
} as const;

export type CraftLaneeConfig = typeof CRAFTLANEE_CONFIG;
