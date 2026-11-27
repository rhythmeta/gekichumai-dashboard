import {
	DatabaseIcon,
	FingerprintIcon,
	KeyRoundIcon,
	PencilLineIcon,
	UserRoundIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
	isWriteScope,
	OAUTH_SCOPES,
	SCOPE_I18N_KEY,
	type OAuthI18nNamespace,
	type OAuthScope,
} from "@/lib/oauth-types";
import { cn } from "@/lib/utils";

export function ScopeIcon({
	scope,
	className,
}: {
	scope: OAuthScope;
	className?: string;
}) {
	if (scope === "openid") return <FingerprintIcon className={className} />;
	if (scope === "profile") return <UserRoundIcon className={className} />;
	if (isWriteScope(scope)) return <PencilLineIcon className={className} />;
	if (scope.startsWith("backup.read.")) {
		return <DatabaseIcon className={className} />;
	}
	return <KeyRoundIcon className={className} />;
}

type ScopeChipsProps = {
	scopes: readonly OAuthScope[];
	ns: OAuthI18nNamespace;
	className?: string;
};

/** Compact permission chips in canonical scope order. */
export function ScopeChips({ scopes, ns, className }: ScopeChipsProps) {
	const { t } = useTranslation(ns);
	const selected = new Set<string>(scopes);
	const ordered = OAUTH_SCOPES.filter((scope) => selected.has(scope));
	if (ordered.length === 0) {
		return null;
	}
	return (
		<div className={cn("flex flex-wrap gap-1.5", className)}>
			{ordered.map((scope) => (
				<Badge
					key={scope}
					variant={isWriteScope(scope) ? "destructive" : "secondary"}
					className="max-w-full truncate"
				>
					<ScopeIcon scope={scope} />
					{t(`${SCOPE_I18N_KEY[scope]}.label`)}
				</Badge>
			))}
		</div>
	);
}
