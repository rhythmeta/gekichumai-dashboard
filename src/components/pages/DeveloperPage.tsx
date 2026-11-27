"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PlusIcon, RefreshCwIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import type { RequestFn } from "@/App";
import { AdminReviewSection } from "@/components/developer/AdminReviewSection";
import { AppFormDialog } from "@/components/developer/AppFormDialog";
import { MyAppCard } from "@/components/developer/MyAppCard";
import { Button } from "@/components/ui/button";
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
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	OAUTH_APP_LIMIT,
	type OAuthApp,
	type OAuthAppsResponse,
} from "@/lib/oauth-types";
import { cn } from "@/lib/utils";

function AppCardSkeleton() {
	return (
		<div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
			<div className="flex items-center gap-3">
				<div className="size-11 animate-pulse rounded-xl bg-muted" />
				<div className="flex flex-1 flex-col gap-2">
					<div className="h-4 w-32 animate-pulse rounded bg-muted" />
					<div className="h-3 w-24 animate-pulse rounded bg-muted" />
				</div>
			</div>
			<div className="h-3 w-full animate-pulse rounded bg-muted" />
			<div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
			<div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
		</div>
	);
}

export function DeveloperPage({
	request,
	isAdmin,
}: {
	request: RequestFn;
	isAdmin: boolean;
}) {
	const { t } = useTranslation("developer");
	const [apps, setApps] = useState<OAuthApp[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<OAuthApp | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<OAuthApp | null>(null);
	const [deleting, setDeleting] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const result = await request<OAuthAppsResponse>("auth/v1/oauth/apps");
			setApps(result.apps);
		} finally {
			setLoading(false);
		}
	}, [request]);

	useEffect(() => {
		void load().catch((error: Error) => toast.error(error.message));
	}, [load]);

	const openCreateDialog = () => {
		setEditing(null);
		setDialogOpen(true);
	};

	const openEditDialog = (app: OAuthApp) => {
		setEditing(app);
		setDialogOpen(true);
	};

	const remove = async () => {
		if (!deleteTarget) return;
		setDeleting(true);
		try {
			await request(`auth/v1/oauth/apps/${encodeURIComponent(deleteTarget.id)}`, {
				method: "DELETE",
			});
			toast.success(t("deleted"));
			setDeleteTarget(null);
			await load();
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setDeleting(false);
		}
	};

	const atLimit = (apps?.length ?? 0) >= OAUTH_APP_LIMIT;

	return (
		<div className="flex min-w-0 flex-col gap-6">
			<Card size="sm">
				<CardHeader>
					<CardTitle>{t("title")}</CardTitle>
					<CardDescription>{t("description")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center gap-2">
					<Button type="button" onClick={openCreateDialog} disabled={atLimit}>
						<PlusIcon data-icon="inline-start" />
						{t("createApp")}
					</Button>
					<Button
						type="button"
						variant="outline"
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
					<p className="text-xs text-muted-foreground">
						{t(atLimit ? "appLimitReached" : "appLimitHint", {
							max: OAUTH_APP_LIMIT,
						})}
					</p>
				</CardContent>
			</Card>

			<section className="flex flex-col gap-3">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h2 className="font-heading text-base font-medium">
						{t("myAppsTitle")}
					</h2>
					{apps ? (
						<p className="text-xs text-muted-foreground">
							{t("myAppsCount", {
								amount: apps.length,
								max: OAUTH_APP_LIMIT,
							})}
						</p>
					) : null}
				</div>

				{apps === null ? (
					<div className="grid items-start gap-4 lg:grid-cols-2">
						<AppCardSkeleton />
						<AppCardSkeleton />
					</div>
				) : apps.length === 0 ? (
					<Card size="sm">
						<CardContent>
							<Empty>
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<SparklesIcon />
									</EmptyMedia>
									<EmptyTitle>{t("emptyTitle")}</EmptyTitle>
									<EmptyDescription>{t("emptyDesc")}</EmptyDescription>
								</EmptyHeader>
								<EmptyContent>
									<Button type="button" onClick={openCreateDialog}>
										<PlusIcon data-icon="inline-start" />
										{t("createApp")}
									</Button>
								</EmptyContent>
							</Empty>
						</CardContent>
					</Card>
				) : (
					<div className="grid items-start gap-4 lg:grid-cols-2">
						{apps.map((app) => (
							<MyAppCard
								key={app.id}
								app={app}
								onEdit={() => openEditDialog(app)}
								onDelete={() => setDeleteTarget(app)}
							/>
						))}
					</div>
				)}
			</section>

			{isAdmin ? (
				<section className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<ShieldCheckIcon className="size-4 text-muted-foreground" />
						<h2 className="font-heading text-base font-medium">
							{t("adminTitle")}
						</h2>
					</div>
					<AdminReviewSection request={request} />
				</section>
			) : null}

			<AppFormDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				app={editing}
				request={request}
				onSaved={() => load()}
			/>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open && !deleting) setDeleteTarget(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("deleteDesc", { name: deleteTarget?.name ?? "" })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>
							{t("cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleting}
							onClick={(event) => {
								event.preventDefault();
								void remove();
							}}
						>
							{deleting ? t("deleting") : t("deleteConfirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
