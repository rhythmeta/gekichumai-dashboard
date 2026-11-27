import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { OAuthAppStatus } from "@/lib/oauth-types";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<OAuthAppStatus, string> = {
	approved:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	pending:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
	rejected:
		"border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive",
};

export function AppStatusBadge({
	status,
	className,
}: {
	status: OAuthAppStatus;
	className?: string;
}) {
	const { t } = useTranslation("developer");
	const labels: Record<OAuthAppStatus, string> = {
		approved: t("statusApproved"),
		pending: t("statusPending"),
		rejected: t("statusRejected"),
	};
	return (
		<Badge variant="outline" className={cn(STATUS_CLASS[status], className)}>
			{labels[status]}
		</Badge>
	);
}
