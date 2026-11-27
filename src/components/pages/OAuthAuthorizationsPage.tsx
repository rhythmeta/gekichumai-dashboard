"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	BanIcon,
	ClockIcon,
	RefreshCwIcon,
	ShieldOffIcon,
	SlidersHorizontalIcon,
} from "lucide-react";
import type { RequestFn } from "@/App";
import { OAuthAppIcon } from "@/components/oauth/OAuthAppIcon";
import { ProfileRestrictionDialog } from "@/components/oauth/ProfileRestrictionDialog";
import { ScopeChips } from "@/components/oauth/ScopeChips";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { HandleText } from "@/components/ui/handle-text";
import { Separator } from "@/components/ui/separator";
import {
	readScopeGames,
	type OAuthAuthorization,
	type OAuthAuthorizationsResponse,
} from "@/lib/oauth-types";
import { cn } from "@/lib/utils";

function AuthorizationCardSkeleton() {
	return (
		<div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
			<div className="flex items-center gap-3">
				<div className="size-11 animate-pulse rounded-xl bg-muted" />
				<div className="flex flex-1 flex-col gap-2">
					<div className="h-4 w-36 animate-pulse rounded bg-muted" />
					<div className="h-3 w-24 animate-pulse rounded bg-muted" />
				</div>
			</div>
			<div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
			<div className="h-8 w-full animate-pulse rounded-lg bg-muted" />
		</div>
	);
}

function AuthorizationCard({
	authorization,
	onManageScope,
	onRevoke,
}: {
	authorization: OAuthAuthorization;
	onManageScope: () => void;
	onRevoke: () => void;
}) {
	const { t } = useTranslation("oauthApps");
	const readGames = readScopeGames(authorization.scopes);
	const createdAt = new Date(authorization.createdAt).toLocaleString();
	const lastUsedAt = authorization.lastUsedAt
		? new Date(authorization.lastUsedAt).toLocaleString()
		: t("neverUsed");

	return (
		<Card size="sm" className="min-w-0">
			<CardHeader>
				<div className="flex min-w-0 items-start gap-3">
					<OAuthAppIcon
						name={authorization.app.name}
						iconDataUrl={authorization.app.iconDataUrl}
					/>
					<div className="min-w-0 flex-1">
						<CardTitle className="min-w-0 truncate">
							{authorization.app.name}
						</CardTitle>
						<p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
							<span>{t("developerLabel")}</span>
							<HandleText
								handle={authorization.app.developerHandle}
								className="font-medium text-foreground"
							/>
						</p>
					</div>
				</div>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				{authorization.app.description ? (
					<p className="text-sm text-muted-foreground">
						{authorization.app.description}
					</p>
				) : null}

				<ScopeChips scopes={authorization.scopes} ns="oauthApps" />

				<div className="grid gap-3 text-xs sm:grid-cols-2">
					<div>
						<p className="text-muted-foreground">{t("authorizedAtLabel")}</p>
						<p className="mt-0.5 flex items-center gap-1 font-medium">
							<ClockIcon className="size-3.5 text-muted-foreground" />
							{createdAt}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground">{t("lastUsedLabel")}</p>
						<p className="mt-0.5 font-medium">{lastUsedAt}</p>
					</div>
				</div>

				{readGames.length > 0 ? (
					<>
						<Separator />
						<div className="flex flex-col gap-2">
							<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{t("dataScopeLabel")}
							</p>
							<div className="flex flex-wrap gap-1.5">
								{readGames.map((game) => {
									const restriction =
										authorization.profileRestrictions[game] ?? [];
									return (
										<Badge key={game} variant="outline" className="gap-1.5">
											<span className="font-medium">{game}</span>
											<span className="text-muted-foreground">
												{restriction.length > 0
													? t("dataScopeCount", { amount: restriction.length })
													: t("dataScopeAll")}
											</span>
										</Badge>
									);
								})}
							</div>
							<p className="text-xs text-muted-foreground">
								{t("dataScopePrivacyHint")}
							</p>
						</div>
					</>
				) : null}

				<div className="flex flex-wrap gap-2">
					{readGames.length > 0 ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onManageScope}
						>
							<SlidersHorizontalIcon data-icon="inline-start" />
							{t("manageDataScope")}
						</Button>
					) : null}
					<Button
						type="button"
						variant="destructive"
						size="sm"
						onClick={onRevoke}
					>
						<BanIcon data-icon="inline-start" />
						{t("revoke")}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export function OAuthAuthorizationsPage({ request }: { request: RequestFn }) {
	const { t } = useTranslation("oauthApps");
	const [authorizations, setAuthorizations] = useState<
		OAuthAuthorization[] | null
	>(null);
	const [loading, setLoading] = useState(true);
	const [revokeTarget, setRevokeTarget] = useState<OAuthAuthorization | null>(
		null,
	);
	const [revoking, setRevoking] = useState(false);
	const [scopeTarget, setScopeTarget] = useState<OAuthAuthorization | null>(
		null,
	);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const result = await request<OAuthAuthorizationsResponse>(
				"auth/v1/oauth/authorizations",
			);
			setAuthorizations(result.authorizations);
		} finally {
			setLoading(false);
		}
	}, [request]);

	useEffect(() => {
		void load().catch((error: Error) => toast.error(error.message));
	}, [load]);

	const revoke = async () => {
		if (!revokeTarget) return;
		setRevoking(true);
		try {
			await request(
				`auth/v1/oauth/authorizations/${encodeURIComponent(revokeTarget.id)}`,
				{ method: "DELETE" },
			);
			toast.success(t("revoked"));
			setRevokeTarget(null);
			await load();
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setRevoking(false);
		}
	};

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<Card size="sm">
				<CardHeader>
					<CardTitle>{t("title")}</CardTitle>
					<CardDescription>{t("description")}</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={loading}
						onClick={() =>
							void load().catch((error: Error) => toast.error(error.message))
						}
					>
						<RefreshCwIcon
							data-icon="inline-start"
							className={cn(loading && "animate-spin")}
						/>
						{t("refresh")}
					</Button>
				</CardContent>
			</Card>

			{authorizations === null ? (
				<div className="grid gap-4 lg:grid-cols-2">
					<AuthorizationCardSkeleton />
					<AuthorizationCardSkeleton />
				</div>
			) : authorizations.length === 0 ? (
				<Card size="sm">
					<CardContent>
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<ShieldOffIcon />
								</EmptyMedia>
								<EmptyTitle>{t("emptyTitle")}</EmptyTitle>
								<EmptyDescription>{t("emptyDesc")}</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 lg:grid-cols-2">
					{authorizations.map((authorization) => (
						<AuthorizationCard
							key={authorization.id}
							authorization={authorization}
							onManageScope={() => setScopeTarget(authorization)}
							onRevoke={() => setRevokeTarget(authorization)}
						/>
					))}
				</div>
			)}

			{scopeTarget ? (
				<ProfileRestrictionDialog
					key={scopeTarget.id}
					authorization={scopeTarget}
					request={request}
					onOpenChange={(open) => {
						if (!open) setScopeTarget(null);
					}}
					onSaved={(updated) => {
						setAuthorizations((previous) =>
							previous
								? previous.map((item) =>
										item.id === updated.id ? updated : item,
									)
								: previous,
						);
					}}
				/>
			) : null}

			<AlertDialog
				open={revokeTarget !== null}
				onOpenChange={(open) => {
					if (!open && !revoking) setRevokeTarget(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("revokeTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("revokeDesc", { name: revokeTarget?.app.name ?? "" })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={revoking}>
							{t("cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={revoking}
							onClick={(event) => {
								event.preventDefault();
								void revoke();
							}}
						>
							{revoking ? t("revoking") : t("revokeConfirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
