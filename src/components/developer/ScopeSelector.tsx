"use client";

import { useTranslation } from "react-i18next";
import { ScopeIcon } from "@/components/oauth/ScopeChips";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
	hasScope,
	OAUTH_SCOPES,
	SCOPE_GROUP,
	SCOPE_GROUP_I18N_KEY,
	SCOPE_GROUP_ORDER,
	SCOPE_I18N_KEY,
	scopeDependencies,
	toggleScopeSelection,
	type OAuthScope,
} from "@/lib/oauth-types";
import { cn } from "@/lib/utils";

type ScopeSelectorProps = {
	value: readonly OAuthScope[];
	onChange: (next: OAuthScope[]) => void;
	disabled?: boolean;
};

/**
 * Grouped permission picker. Selecting a write scope also selects its read
 * counterpart (and the read card explains why it is checked).
 */
export function ScopeSelector({
	value,
	onChange,
	disabled = false,
}: ScopeSelectorProps) {
	const { t } = useTranslation("developer");

	return (
		<div className="flex flex-col gap-4">
			{SCOPE_GROUP_ORDER.map((group) => (
				<div key={group} className="flex flex-col gap-2">
					<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{t(SCOPE_GROUP_I18N_KEY[group])}
					</p>
					<div className="grid gap-2 sm:grid-cols-2">
						{OAUTH_SCOPES.filter((scope) => SCOPE_GROUP[scope] === group).map(
							(scope) => {
								const checked = hasScope(value, scope);
								const impliedByWrite = OAUTH_SCOPES.find(
									(candidate) =>
										candidate !== scope &&
										hasScope(value, candidate) &&
										scopeDependencies[candidate].includes(scope),
								);
								const toggle = () => {
									if (disabled) return;
									onChange(toggleScopeSelection(value, scope, !checked));
								};
								return (
									<div
										key={scope}
										role="checkbox"
										aria-checked={checked}
										aria-disabled={disabled}
										tabIndex={disabled ? -1 : 0}
										onClick={toggle}
										onKeyDown={(event) => {
											if (event.key === " " || event.key === "Enter") {
												event.preventDefault();
												toggle();
											}
										}}
										className={cn(
											"flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
											checked
												? "border-primary/50 bg-primary/5"
												: "hover:bg-muted/60",
											disabled && "cursor-not-allowed opacity-60",
										)}
									>
										<Checkbox
											checked={checked}
											tabIndex={-1}
											aria-hidden
											disabled={disabled}
											className="pointer-events-none mt-0.5"
										/>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1.5 text-sm font-medium">
												<ScopeIcon
													scope={scope}
													className="size-4 text-muted-foreground"
												/>
												<span>{t(`${SCOPE_I18N_KEY[scope]}.label`)}</span>
											</div>
											<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
												{t(`${SCOPE_I18N_KEY[scope]}.description`)}
											</p>
											{impliedByWrite ? (
												<Badge variant="outline" className="mt-2">
													{t("scopeIncludesRead")}
												</Badge>
											) : null}
										</div>
									</div>
								);
							},
						)}
					</div>
				</div>
			))}
		</div>
	);
}
