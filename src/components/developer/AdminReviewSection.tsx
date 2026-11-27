"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	CheckIcon,
	ClockIcon,
	HistoryIcon,
	RefreshCwIcon,
	UserRoundIcon,
	XIcon,
} from "lucide-react";
import type { RequestFn } from "@/App";
import { OAuthAppIcon } from "@/components/oauth/OAuthAppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
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
import { Textarea } from "@/components/ui/textarea";
import {
	OAUTH_REVIEW_NOTE_MAX,
	type AdminReviewApp,
	type AdminReviewAppsResponse,
	type OAuthReviewDecision,
} from "@/lib/oauth-types";
import { cn } from "@/lib/utils";
import { AppMeta } from "./AppMeta";
import { AppStatusBadge } from "./AppStatusBadge";

function SkeletonRow() {
	return (
		<div className="flex flex-col gap-2 rounded-xl border p-4">
			<div className="h-4 w-40 animate-pulse rounded bg-muted" />
			<div className="h-3 w-64 animate-pulse rounded bg-muted" />
			<div className="h-3 w-full animate-pulse rounded bg-muted" />
		</div>
	);
}

type PendingReviewCardProps = {
	app: AdminReviewApp;
	note: string;
	busy: boolean;
	onNoteChange: (value: string) => void;
	onDecide: (decision: OAuthReviewDecision) => void;
};

function PendingReviewCard({
	app,
	note,
	busy,
	onNoteChange,
	onDecide,
}: PendingReviewCardProps) {
	const { t } = useTranslation("developer");
	return (
		<Card size="sm" className="min-w-0">
			<CardHeader>
				<div className="flex min-w-0 items-start gap-3">
					<OAuthAppIcon name={app.name} iconDataUrl={app.iconDataUrl} />
					<div className="min-w-0 flex-1">
						<CardTitle className="min-w-0 truncate">{app.name}</CardTitle>
						<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
							<span className="inline-flex items-center gap-1">
								<UserRoundIcon className="size-3.5" />
								<HandleText handle={app.developer.handle} />
							</span>
							<span className="truncate">{app.developer.email}</span>
							<span className="inline-flex items-center gap-1">
								<ClockIcon className="size-3.5" />
								{new Date(app.createdAt).toLocaleString()}
							</span>
						</div>
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AppMeta app={app} />
				<div className="flex flex-col gap-2">
					<Textarea
						value={note}
						maxLength={OAUTH_REVIEW_NOTE_MAX}
						placeholder={t("reviewNotePlaceholder")}
						aria-label={t("reviewNoteLabel")}
						onChange={(event) => onNoteChange(event.target.value)}
					/>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="text-xs text-muted-foreground">
							{t("reviewNoteHint", {
								amount: note.length,
								max: OAUTH_REVIEW_NOTE_MAX,
							})}
						</p>
						<div className="flex gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={busy}
								onClick={() => onDecide("reject")}
							>
								<XIcon data-icon="inline-start" />
								{t("reject")}
							</Button>
							<Button
								type="button"
								size="sm"
								disabled={busy}
								onClick={() => onDecide("approve")}
							>
								<CheckIcon data-icon="inline-start" />
								{t("approve")}
							</Button>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function AdminReviewSection({ request }: { request: RequestFn }) {
	const { t } = useTranslation("developer");
	const [pending, setPending] = useState<AdminReviewApp[] | null>(null);
	const [history, setHistory] = useState<AdminReviewApp[] | null>(null);
	const [notes, setNotes] = useState<Record<string, string>>({});
	const [busyId, setBusyId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [pendingResult, historyResult] = await Promise.all([
				request<AdminReviewAppsResponse>("auth/v1/oauth/reviews/pending"),
				request<AdminReviewAppsResponse>("auth/v1/oauth/reviews/history"),
			]);
			setPending(pendingResult.apps);
			setHistory(historyResult.apps);
		} finally {
			setLoading(false);
		}
	}, [request]);

	useEffect(() => {
		void load().catch((error: Error) => toast.error(error.message));
	}, [load]);

	const decide = async (app: AdminReviewApp, decision: OAuthReviewDecision) => {
		setBusyId(app.id);
		try {
			const note = (notes[app.id] ?? "").trim();
			await request(`auth/v1/oauth/reviews/${encodeURIComponent(app.id)}`, {
				method: "POST",
				body: note ? { decision, note } : { decision },
			});
			setNotes((previous) => {
				const next = { ...previous };
				delete next[app.id];
				return next;
			});
			toast.success(t("reviewSubmitted"));
			await load();
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusyId(null);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<Card size="sm">
				<CardHeader>
					<CardTitle>{t("adminPendingTitle")}</CardTitle>
					<CardDescription>{t("adminPendingDesc")}</CardDescription>
					<CardAction>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={loading}
							onClick={() => void load().catch((error: Error) => toast.error(error.message))}
						>
							<RefreshCwIcon
								data-icon="inline-start"
								className={cn(loading && "animate-spin")}
							/>
							{t("refresh")}
						</Button>
					</CardAction>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{pending === null ? (
						<>
							<SkeletonRow />
							<SkeletonRow />
						</>
					) : pending.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<CheckIcon />
								</EmptyMedia>
								<EmptyTitle>{t("adminPendingEmpty")}</EmptyTitle>
								<EmptyDescription>
									{t("adminPendingEmptyDesc")}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						pending.map((app) => (
							<PendingReviewCard
								key={app.id}
								app={app}
								note={notes[app.id] ?? ""}
								busy={busyId === app.id}
								onNoteChange={(value) =>
									setNotes((previous) => ({ ...previous, [app.id]: value }))
								}
								onDecide={(decision) => void decide(app, decision)}
							/>
						))
					)}
				</CardContent>
			</Card>

			<Card size="sm">
				<CardHeader>
					<CardTitle>{t("adminHistoryTitle")}</CardTitle>
					<CardDescription>{t("adminHistoryDesc")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{history === null ? (
						<SkeletonRow />
					) : history.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<HistoryIcon />
								</EmptyMedia>
								<EmptyTitle>{t("adminHistoryEmpty")}</EmptyTitle>
							</EmptyHeader>
						</Empty>
					) : (
						history.map((app) => (
							<div
								key={app.id}
								className="flex flex-col gap-2 rounded-xl border p-3"
							>
								<div className="flex min-w-0 items-center gap-2.5">
									<OAuthAppIcon
										name={app.name}
										iconDataUrl={app.iconDataUrl}
										size="sm"
									/>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{app.name}</p>
										<p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
											<HandleText handle={app.developer.handle} />
											{app.reviewedAt ? (
												<span>
													{t("reviewedAtLabel", {
														time: new Date(app.reviewedAt).toLocaleString(),
													})}
												</span>
											) : null}
										</p>
									</div>
									<AppStatusBadge status={app.status} />
								</div>
								{app.reviewedByHandle ? (
									<Badge variant="outline" className="w-fit">
										{t("reviewedByLabel", { handle: app.reviewedByHandle })}
									</Badge>
								) : null}
								{app.reviewNote ? (
									<p className="rounded-lg bg-muted/60 px-2.5 py-2 text-xs whitespace-pre-line text-muted-foreground">
										{app.reviewNote}
									</p>
								) : null}
							</div>
						))
					)}
				</CardContent>
			</Card>
		</div>
	);
}
