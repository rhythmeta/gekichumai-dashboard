"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DatabaseIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { RequestFn } from "@/App";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BackendRequestError } from "@/lib/backend-client";
import type {
	BackupProfileSummary,
	LatestBackupProfiles,
	OAuthGame,
	OAuthI18nNamespace,
} from "@/lib/oauth-types";
import { cn } from "@/lib/utils";

type ProfilePickerState =
	| { status: "loading" }
	| { status: "ready"; profiles: BackupProfileSummary[]; backupAt: string | null }
	| { status: "noBackup" }
	| { status: "error"; message: string };

export function isBackupMissingError(error: unknown): boolean {
	if (error instanceof BackendRequestError) {
		return error.code === "backup_not_found" || error.status === 404;
	}
	return false;
}

type ProfilePickerProps = {
	request: RequestFn;
	game: OAuthGame;
	selected: readonly string[];
	onChange: (next: string[]) => void;
	ns: OAuthI18nNamespace;
	disabled?: boolean;
	className?: string;
	/** Called with the profile ids that exist in the latest backup (may be empty). */
	onAvailableProfiles?: (profileIds: string[]) => void;
};

/**
 * Loads the profiles of the latest committed backup for one game and lets the
 * user restrict an app/authorization to a subset. An empty selection means
 * "all profiles", matching the backend contract.
 */
export function ProfilePicker({
	request,
	game,
	selected,
	onChange,
	ns,
	disabled = false,
	className,
	onAvailableProfiles,
}: ProfilePickerProps) {
	const { t } = useTranslation(ns);
	const [state, setState] = useState<ProfilePickerState>({ status: "loading" });
	const availableCallback = useRef(onAvailableProfiles);
	useEffect(() => {
		availableCallback.current = onAvailableProfiles;
	}, [onAvailableProfiles]);

	useEffect(() => {
		let cancelled = false;
		setState({ status: "loading" });
		void request<LatestBackupProfiles>(
			`auth/v1/oauth/latest-backup-profiles?game=${game}`,
		)
			.then((result) => {
				if (cancelled) return;
				setState({
					status: "ready",
					profiles: result.profiles,
					backupAt: result.committedAt,
				});
				availableCallback.current?.(
					result.profiles.map((profile) => profile.id),
				);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				if (isBackupMissingError(error)) {
					setState({ status: "noBackup" });
					availableCallback.current?.([]);
					return;
				}
				setState({ status: "error", message: (error as Error).message });
				availableCallback.current?.([]);
			});
		return () => {
			cancelled = true;
		};
	}, [request, game]);

	const toggle = (profileId: string) => {
		const next = selected.includes(profileId)
			? selected.filter((value) => value !== profileId)
			: [...selected, profileId];
		onChange(next);
	};

	if (state.status === "loading") {
		return (
			<div className={cn("flex flex-col gap-2", className)}>
				{[0, 1, 2].map((index) => (
					<div
						key={index}
						className="h-10 w-full animate-pulse rounded-lg bg-muted"
					/>
				))}
			</div>
		);
	}

	if (state.status === "noBackup") {
		return (
			<Alert className={className}>
				<InfoIcon />
				<AlertTitle>{t("noBackupTitle")}</AlertTitle>
				<AlertDescription>{t("noBackupDesc")}</AlertDescription>
			</Alert>
		);
	}

	if (state.status === "error") {
		return (
			<Alert variant="destructive" className={className}>
				<TriangleAlertIcon />
				<AlertTitle>{t("profilesLoadFailed")}</AlertTitle>
				<AlertDescription>{state.message}</AlertDescription>
			</Alert>
		);
	}

	if (state.profiles.length === 0) {
		return (
			<p className={cn("text-sm text-muted-foreground", className)}>
				{t("noProfiles")}
			</p>
		);
	}

	const allIds = state.profiles.map((profile) => profile.id);
	const selectedIds = selected.filter((id) => allIds.includes(id));
	const backupAt = state.backupAt
		? new Date(state.backupAt).toLocaleString()
		: null;

	return (
		<div className={cn("flex flex-col gap-3", className)}>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<DatabaseIcon className="size-3.5" />
					{backupAt ? t("backupAt", { time: backupAt }) : t("backupAtUnknown")}
				</p>
				<div className="flex gap-2">
					<Button
						type="button"
						size="xs"
						variant="outline"
						disabled={disabled || selectedIds.length === allIds.length}
						onClick={() => onChange(allIds)}
					>
						{t("selectAll")}
					</Button>
					<Button
						type="button"
						size="xs"
						variant="outline"
						disabled={disabled || selectedIds.length === 0}
						onClick={() => onChange([])}
					>
						{t("clearAll")}
					</Button>
				</div>
			</div>

			<div className="grid gap-2 sm:grid-cols-2">
				{state.profiles.map((profile) => {
					const checked = selectedIds.includes(profile.id);
					return (
						<label
							key={profile.id}
							className={cn(
								"flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition-colors",
								checked
									? "border-primary/50 bg-primary/5"
									: "hover:bg-muted/60",
								disabled && "cursor-not-allowed opacity-60",
							)}
						>
							<Checkbox
								checked={checked}
								disabled={disabled}
								onCheckedChange={() => toggle(profile.id)}
							/>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-medium">
									{profile.name || profile.id}
								</span>
								<span className="block truncate text-xs text-muted-foreground">
									{profile.playerRating == null
										? t("ratingUnknown")
										: t("profileRating", {
												rating: profile.playerRating.toLocaleString(),
											})}
								</span>
							</span>
							{profile.active ? null : (
								<span className="shrink-0 text-[0.7rem] text-muted-foreground">
									{t("inactiveProfile")}
								</span>
							)}
						</label>
					);
				})}
			</div>

			<p className="text-xs text-muted-foreground">
				{selectedIds.length > 0
					? t("selectedCount", { amount: selectedIds.length })
					: t("allProfilesHint")}
			</p>
		</div>
	);
}
