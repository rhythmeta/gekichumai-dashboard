import { useTranslation } from "react-i18next";
import { ExternalLinkIcon, MonitorSmartphoneIcon } from "lucide-react";
import { ScopeChips } from "@/components/oauth/ScopeChips";
import type { OAuthApp, OAuthI18nNamespace, OAuthScope } from "@/lib/oauth-types";
import { cn } from "@/lib/utils";

type AppMetaFields = Pick<
	OAuthApp,
	"description" | "websiteUrl" | "redirectUris" | "scopes"
>;

type AppMetaProps = {
	app: AppMetaFields;
	ns?: OAuthI18nNamespace;
	className?: string;
	scopes?: readonly OAuthScope[];
};

/** Description + website + callback URIs + permission chips of a developer app. */
export function AppMeta({
	app,
	ns = "developer",
	className,
	scopes,
}: AppMetaProps) {
	const { t } = useTranslation(ns);
	const permissions = scopes ?? app.scopes;
	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{app.description ? (
				<p className="text-sm whitespace-pre-line text-muted-foreground">
					{app.description}
				</p>
			) : null}

			{app.websiteUrl ? (
				<a
					href={app.websiteUrl}
					target="_blank"
					rel="noreferrer noopener"
					className="inline-flex w-fit max-w-full items-center gap-1 text-sm text-primary hover:underline"
				>
					<ExternalLinkIcon className="size-3.5 shrink-0" />
					<span className="truncate">{app.websiteUrl}</span>
				</a>
			) : null}

			{app.redirectUris.length > 0 ? (
				<div className="min-w-0">
					<p className="text-xs font-medium text-muted-foreground">
						{t("callbackLabel")}
					</p>
					<ul className="mt-1.5 flex flex-col gap-1">
						{app.redirectUris.map((uri) => (
							<li
								key={uri}
								className="truncate rounded-md bg-muted/60 px-2 py-1 font-mono text-xs"
								title={uri}
							>
								{uri}
							</li>
						))}
					</ul>
				</div>
			) : (
				<div className="min-w-0">
					<p className="text-xs font-medium text-muted-foreground">
						{t("authMethodLabel")}
					</p>
					<p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs">
						<MonitorSmartphoneIcon className="size-3.5 text-muted-foreground" />
						{t("deviceFlowBadge")}
					</p>
				</div>
			)}

			{permissions.length > 0 ? (
				<div className="min-w-0">
					<p className="text-xs font-medium text-muted-foreground">
						{t("scopesLabel")}
					</p>
					<ScopeChips scopes={permissions} ns={ns} className="mt-1.5" />
				</div>
			) : null}
		</div>
	);
}
