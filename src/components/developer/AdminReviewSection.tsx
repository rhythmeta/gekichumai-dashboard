"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	CheckIcon,
	ClockIcon,
	HistoryIcon,
	RefreshCwIcon,
	RotateCcwIcon,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePagination } from "@/components/ui/table-pagination";
import { Textarea } from "@/components/ui/textarea";
import {
	OAUTH_REVIEW_HISTORY_PAGE_SIZE,
	OAUTH_REVIEW_NOTE_MAX,
	type AdminReviewApp,
	type AdminReviewAppsResponse,
	type AdminReviewHistoryResponse,
	type OAuthReviewDecision,
	type OAuthReviewStatusFilter,
} from "@/lib/oauth-types";
import { cn } from "@/lib/utils";
import { AppMeta } from "./AppMeta";
import { AppStatusBadge } from "./AppStatusBadge";
import { ReReviewDialog } from "./ReReviewDialog";

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

function HistoryRow({
	app,
	onReReview,
}: {
	app: AdminReviewApp;
	onReReview: () => void;
}) {
	const { t } = useTranslation("developer");
	const reviewCount = app.reviews?.length ?? 0;
	return (
		<div className="flex flex-col gap-2.5 rounded-xl border p-3">
			<div className="flex min-w-0 flex-wrap items-center gap-2.5">
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

			<div className="flex flex-wrap items-center gap-1.5">
				{app.reviewedByHandle ? (
					<Badge variant="outline">
						{t("reviewedByLabel", { handle: app.reviewedByHandle })}
					</Badge>
				) : null}
				{reviewCount > 0 ? (
					<Badge variant="secondary">
						{t("adminHistoryRecordCount", { amount: reviewCount })}
					</Badge>
				) : null}
			</div>

			{app.reviewNote ? (
				<p className="rounded-lg bg-muted/60 px-2.5 py-2 text-xs whitespace-pre-line text-muted-foreground">
					{app.reviewNote}
				</p>
			) : null}

			<div className="flex justify-end">
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={onReReview}
				>
					<RotateCcwIcon data-icon="inline-start" />
					{t("reReview")}
				</Button>
			</div>
		</div>
	);
}

export function AdminReviewSection({ request }: { request: RequestFn }) {
	const { t } = useTranslation("developer");
	const [pending, setPending] = useState<AdminReviewApp[] | null>(null);
	const [pendingLoading, setPendingLoading] = useState(true);
	const [notes, setNotes] = useState<Record<string, string>>({});
	const [busyId, setBusyId] = useState<string | null>(null);

	const [historyStatus, setHistoryStatus] =
		useState<OAuthReviewStatusFilter>("all");
	const [historyOffset, setHistoryOffset] = useState(0);
	const [history, setHistory] = useState<AdminReviewHistoryResponse | null>(
		null,
	);
	const [historyLoading, setHistoryLoading] = useState(true);
	const [reReviewTarget, setReReviewTarget] = useState<AdminReviewApp | null>(
		null,
	);

	const loadPending = useCallback(async () => {
		setPendingLoading(true);
		try {
			const result = await request<AdminReviewAppsResponse>(
				"auth/v1/oauth/reviews/pending",
			);
			setPending(result.apps);
		} finally {
			setPendingLoading(false);
		}
	}, [request]);

	const loadHistory = useCallback(async () => {
		setHistoryLoading(true);
		try {
			const query = new URLSearchParams({
				status: historyStatus,
				limit: String(OAUTH_REVIEW_HISTORY_PAGE_SIZE),
				offset: String(historyOffset),
			});
			const result = await request<AdminReviewHistoryResponse>(
				`auth/v1/oauth/reviews/history?${query.toString()}`,
			);
			// The last record of a page may disappear after a re-review; fall back
			// to the previous page instead of showing an empty list.
			if (
				result.apps.length === 0 &&
				result.total > 0 &&
				historyOffset > 0
			) {
				setHistoryOffset(
					Math.max(0, historyOffset - OAUTH_REVIEW_HISTORY_PAGE_SIZE),
				);
				return;
			}
			setHistory(result);
		} finally {
			setHistoryLoading(false);
		}
	}, [request, historyStatus, historyOffset]);

	useEffect(() => {
		void loadPending().catch((error: Error) => toast.error(error.message));
	}, [loadPending]);

	useEffect(() => {
		void loadHistory().catch((error: Error) => toast.error(error.message));
	}, [loadHistory]);

	const reloadAll = useCallback(async () => {
		await Promise.all([loadPending(), loadHistory()]);
	}, [loadPending, loadHistory]);

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
			await reloadAll();
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setBusyId(null);
		}
	};

	const historyTotal = history?.total ?? 0;
	const historyPageCount = Math.max(
		1,
		Math.ceil(historyTotal / OAUTH_REVIEW_HISTORY_PAGE_SIZE),
	);
	const historyPage =
		Math.floor(historyOffset / OAUTH_REVIEW_HISTORY_PAGE_SIZE) + 1;
	const historyFilterEmpty =
		historyStatus === "all" ? t("adminHistoryEmpty") : t("adminHistoryNoMatch");

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
							disabled={pendingLoading}
							onClick={() =>
								void reloadAll().catch((error: Error) =>
									toast.error(error.message),
								)
							}
						>
							<RefreshCwIcon
								data-icon="inline-start"
								className={cn(pendingLoading && "animate-spin")}
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
					<CardAction>
						<div className="flex flex-wrap items-center justify-end gap-2">
							<Select
								value={historyStatus}
								onValueChange={(value) => {
									setHistoryStatus(value as OAuthReviewStatusFilter);
									setHistoryOffset(0);
								}}
							>
								<SelectTrigger
									size="sm"
									className="w-28"
									aria-label={t("adminHistoryFilterLabel")}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										{t("adminHistoryFilterAll")}
									</SelectItem>
									<SelectItem value="approved">
										{t("adminHistoryFilterApproved")}
									</SelectItem>
									<SelectItem value="rejected">
										{t("adminHistoryFilterRejected")}
									</SelectItem>
								</SelectContent>
							</Select>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={historyLoading}
								onClick={() =>
									void loadHistory().catch((error: Error) =>
										toast.error(error.message),
									)
								}
							>
								<RefreshCwIcon
									data-icon="inline-start"
									className={cn(historyLoading && "animate-spin")}
								/>
								{t("refresh")}
							</Button>
						</div>
					</CardAction>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{history === null ? (
						<>
							<SkeletonRow />
							<SkeletonRow />
						</>
					) : history.apps.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<HistoryIcon />
								</EmptyMedia>
								<EmptyTitle>{historyFilterEmpty}</EmptyTitle>
								<EmptyDescription>
									{t("adminHistoryEmptyDesc")}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="text-xs text-muted-foreground">
									{t("adminHistoryTotal", { total: historyTotal })}
								</p>
							</div>
							{history.apps.map((app) => (
								<HistoryRow
									key={app.id}
									app={app}
									onReReview={() => setReReviewTarget(app)}
								/>
							))}
							{historyTotal > OAUTH_REVIEW_HISTORY_PAGE_SIZE ? (
								<TablePagination
									page={historyPage}
									pageCount={historyPageCount}
									pageSize={OAUTH_REVIEW_HISTORY_PAGE_SIZE}
									pageSizeOptions={[OAUTH_REVIEW_HISTORY_PAGE_SIZE]}
									onPageChange={(page) =>
										setHistoryOffset(
											(page - 1) * OAUTH_REVIEW_HISTORY_PAGE_SIZE,
										)
									}
									onPageSizeChange={() => {}}
								/>
							) : null}
						</>
					)}
				</CardContent>
			</Card>

			{reReviewTarget ? (
				<ReReviewDialog
					key={reReviewTarget.id}
					app={reReviewTarget}
					open
					onOpenChange={(open) => {
						if (!open) setReReviewTarget(null);
					}}
					request={request}
					onReviewed={reloadAll}
				/>
			) : null}
		</div>
	);
}
