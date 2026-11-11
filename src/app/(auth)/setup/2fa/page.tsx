import { cookies } from "next/headers";
import { AuthGuard } from "@/components/auth/auth-guard";
import { TwoFactorSetupClient } from "./two-factor-setup-client";

export const dynamic = "force-dynamic";

export default async function TwoFactorSetupPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const { token } = await searchParams;
	return (
		<AuthGuard mode="public" allowAuthenticated>
			<TwoFactorSetupClient token={token} />
		</AuthGuard>
	);
}
