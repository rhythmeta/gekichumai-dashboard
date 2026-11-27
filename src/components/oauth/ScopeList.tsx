import { useTranslation } from "react-i18next";
import { ScopeIcon } from "@/components/oauth/ScopeChips";
import {
	groupScopesByCategory,
	SCOPE_GROUP_I18N_KEY,
	SCOPE_I18N_KEY,
	type OAuthI18nNamespace,
	type OAuthScope,
} from "@/lib/oauth-types";
import { cn } from "@/lib/utils";

type ScopeListProps = {
	scopes: readonly OAuthScope[];
	ns: OAuthI18nNamespace;
	className?: string;
};

/** Read-only permission list, grouped by identity / API and described item by item. */
export function ScopeList({ scopes, ns, className }: ScopeListProps) {
	const { t } = useTranslation(ns);
	const groups = groupScopesByCategory(scopes);
	return (
		<div className={cn("flex flex-col gap-4", className)}>
			{groups.map(({ group, scopes: groupScopes }) => (
				<div key={group}>
					<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{t(SCOPE_GROUP_I18N_KEY[group])}
					</p>
					<ul className="mt-2 flex flex-col gap-2.5">
						{groupScopes.map((scope) => (
							<li key={scope} className="flex items-start gap-2.5">
								<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
									<ScopeIcon scope={scope} className="size-4" />
								</span>
								<div className="min-w-0">
									<p className="text-sm font-medium">
										{t(`${SCOPE_I18N_KEY[scope]}.label`)}
									</p>
									<p className="text-xs leading-relaxed text-muted-foreground">
										{t(`${SCOPE_I18N_KEY[scope]}.description`)}
									</p>
								</div>
							</li>
						))}
					</ul>
				</div>
			))}
		</div>
	);
}
