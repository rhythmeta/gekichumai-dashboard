"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	CheckIcon,
	ClockIcon,
	HistoryIcon,
	UserRoundIcon,
	XIcon,
} from "lucide-react";
import type { RequestFn } from "@/App";
import { OAuthAppIcon } from "@/components/oauth/OAuthAppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { HandleText } from "@/components/ui/handle-text";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
	OAUTH_REVIEW_NOTE_MAX,
	type AdminReviewApp,
	type AdminReviewRecord,
	type OAuthReviewDecision,
} from "@/lib/oauth-types";
import { cn } from "@/lib/utils";
import { AppMeta } from "./AppMeta";
import { AppStatusBadge } from "./AppStatusBadge";

function ReviewTimelineEntry({ record }: { record: AdminReviewRecord }) {
	const { t } = useTranslation("developer");
	const approved = record.decision === "approved";
	return (
		<li className="flex gap-2.5">
			<span
				className={cn(
					"mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
					approved
						? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
						: "bg-destructive/10 text-destructive",
				)}
			>
				{approved ? (
					<CheckIcon className="size-3.5" />
				) : (
					<XIcon className="size-3.5" />
				)}
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
					<Badge
						variant="outline"
						className={
							approved
								? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
								: "border-destructive/30 bg-destructive/10 text-destructive"
						}
					>
						{approved ? t("statusApproved") : t("statusRejected")}
					</Badge>
					<span className="inline-flex items-center gap-1 text-muted-foreground">
						<ClockIcon className="size-3" />
						{new Date(record.createdAt).toLocaleString()}
					</span>
					<span className="text-muted-foreground">
						{record.reviewerHandle
							? t("reviewTimelineBy", { handle: record.reviewerHandle })
							: t("reviewTimelineUnknownReviewer")}
					</span>
				</div>
				{record.note ? (
					<p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-xs whitespace-pre-line text-muted-foreground">
						{record.note}
					</p>
				) : null}
			</div>
		</li>
	);
}

type ReReviewDialogProps = {
	app: AdminReviewApp;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	request: RequestFn;
	onReviewed: () => void | Promise<void>;
};

export function ReReviewDialog({
	app,
	open,
	onOpenChange,
	request,
	onReviewed,
}: ReReviewDialogProps) {
	const { t } = useTranslation("developer");
	const [note, setNote] = useState("");
	const [submitting, setSubmitting] = useState<OAuthReviewDecision | null>(null);
	const reviews = app.reviews ?? [];

	useEffect(() => {
		if (!open) return;
		setNote("");
		setSubmitting(null);
	}, [open, app.id]);

	const submit = async (decision: OAuthReviewDecision) => {
		setSubmitting(decision);
		try {
			const trimmed = note.trim();
			await request(`auth/v1/oauth/reviews/${encodeURIComponent(app.id)}`, {
				method: "POST",
				body: trimmed ? { decision, note: trimmed } : { decision },
			});
			toast.success(t("reviewSubmitted"));
			await onReviewed();
			onOpenChange(false);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setSubmitting(null);
		}
	};

	const busy = submitting !== null;
	const currentApproved = app.status === "approved";
	const currentRejected = app.status === "rejected";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{t("reReviewTitle")}</DialogTitle>
					<DialogDescription>{t("reReviewDesc")}</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex min-w-0 flex-wrap items-center gap-2.5">
						<OAuthAppIcon name={app.name} iconDataUrl={app.iconDataUrl} />
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="min-w-0 truncate text-sm font-medium">
									{app.name}
								</span>
								<AppStatusBadge status={app.status} />
							</div>
							<p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
								<span className="inline-flex items-center gap-1">
									<UserRoundIcon className="size-3.5" />
									<HandleText handle={app.developer.handle} />
								</span>
								<span className="truncate">{app.developer.email}</span>
							</p>
						</div>
					</div>

					<AppMeta app={app} />

					<Separator />

					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							{t("reReviewCurrentStatus")}
						</p>
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
							{app.reviewedAt ? (
								<span>
									{t("reviewedAtLabel", {
										time: new Date(app.reviewedAt).toLocaleString(),
									})}
								</span>
							) : null}
							{app.reviewedByHandle ? (
								<span>
									{t("reviewedByLabel", { handle: app.reviewedByHandle })}
								</span>
							) : null}
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							<HistoryIcon className="size-3.5" />
							{t("reReviewTimelineTitle")}
						</p>
						{reviews.length === 0 ? (
							<p className="text-xs text-muted-foreground">
								{t("reReviewTimelineEmpty")}
							</p>
						) : (
							<ol className="flex flex-col gap-3">
								{reviews.map((record) => (
									<ReviewTimelineEntry
										key={`${record.decision}-${record.createdAt}`}
										record={record}
									/>
								))}
							</ol>
						)}
					</div>

					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="oauth-re-review-note"
							className="text-sm font-medium"
						>
							{t("reviewNoteLabel")}
						</label>
						<Textarea
							id="oauth-re-review-note"
							value={note}
							maxLength={OAUTH_REVIEW_NOTE_MAX}
							placeholder={t("reviewNotePlaceholder")}
							disabled={busy}
							onChange={(event) => setNote(event.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							{t("reviewNoteHint", {
								amount: note.length,
								max: OAUTH_REVIEW_NOTE_MAX,
							})}
						</p>
					</div>

					{(currentApproved || currentRejected) && (
						<p className="rounded-lg border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
							{t("reviewCurrentDecisionHint", {
								status: currentApproved
									? t("statusApproved")
									: t("statusRejected"),
							})}
						</p>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={() => onOpenChange(false)}
					>
						{t("cancel")}
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={busy || currentRejected}
						onClick={() => void submit("reject")}
					>
						<XIcon data-icon="inline-start" />
						{submitting === "reject" ? t("reviewing") : t("reject")}
					</Button>
					<Button
						type="button"
						disabled={busy || currentApproved}
						onClick={() => void submit("approve")}
					>
						<CheckIcon data-icon="inline-start" />
						{submitting === "approve" ? t("reviewing") : t("approve")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
