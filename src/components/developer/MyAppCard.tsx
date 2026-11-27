"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	ChevronDownIcon,
	CopyIcon,
	EyeIcon,
	EyeOffIcon,
	InfoIcon,
	KeyRoundIcon,
	PencilIcon,
	Trash2Icon,
} from "lucide-react";
import { OAuthAppIcon } from "@/components/oauth/OAuthAppIcon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { OAuthApp } from "@/lib/oauth-types";
import { AppMeta } from "./AppMeta";
import { AppStatusBadge } from "./AppStatusBadge";

type CredentialRowProps = {
	label: string;
	value: string;
	masked?: boolean;
	onToggleVisibility?: () => void;
	onCopy: () => void;
	revealLabel?: string;
	copyLabel: string;
};

function CredentialRow({
	label,
	value,
	masked = false,
	onToggleVisibility,
	onCopy,
	revealLabel,
	copyLabel,
}: CredentialRowProps) {
	return (
		<div className="min-w-0 rounded-lg border bg-muted/40 px-2.5 py-2">
			<div className="flex items-center justify-between gap-2">
				<span className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
					{label}
				</span>
				<div className="flex gap-0.5">
					{onToggleVisibility ? (
						<Button
							type="button"
							size="icon-xs"
							variant="ghost"
							aria-label={revealLabel}
							onClick={onToggleVisibility}
						>
							{masked ? <EyeIcon /> : <EyeOffIcon />}
						</Button>
					) : null}
					<Button
						type="button"
						size="icon-xs"
						variant="ghost"
						aria-label={copyLabel}
						onClick={onCopy}
					>
						<CopyIcon />
					</Button>
				</div>
			</div>
			<code
				className="mt-1 block truncate font-mono text-xs"
				title={masked ? undefined : value}
			>
				{masked ? "••••••••••••••••••••" : value}
			</code>
		</div>
	);
}

type MyAppCardProps = {
	app: OAuthApp;
	onEdit: () => void;
	onDelete: () => void;
};

export function MyAppCard({ app, onEdit, onDelete }: MyAppCardProps) {
	const { t } = useTranslation("developer");
	const [secretVisible, setSecretVisible] = useState(false);
	/** Credentials start collapsed so the card stays scannable. */
	const [credentialsOpen, setCredentialsOpen] = useState(false);
	const credentialsId = `oauth-app-credentials-${app.id}`;
	const createdAt = new Date(app.createdAt).toLocaleString();

	const copy = async (value: string) => {
		const copied = await copyTextToClipboard(value);
		if (copied) {
			toast.success(t("copied"));
		} else {
			toast.error(t("copyFailed"));
		}
	};

	return (
		<Card size="sm" className="min-w-0">
			<CardHeader>
				<div className="flex min-w-0 items-start gap-3">
					<OAuthAppIcon name={app.name} iconDataUrl={app.iconDataUrl} />
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<CardTitle className="min-w-0 truncate">{app.name}</CardTitle>
							<AppStatusBadge status={app.status} />
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{t("createdAtLabel", { time: createdAt })}
						</p>
					</div>
				</div>
				<CardAction>
					<div className="flex gap-1">
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							aria-label={t("edit")}
							onClick={onEdit}
						>
							<PencilIcon />
						</Button>
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							aria-label={t("delete")}
							onClick={onDelete}
						>
							<Trash2Icon />
						</Button>
					</div>
				</CardAction>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				<AppMeta app={app} />

				{app.reviewNote ? (
					<Alert
						variant={app.status === "rejected" ? "destructive" : "default"}
					>
						<InfoIcon />
						<AlertTitle>{t("reviewNoteTitle")}</AlertTitle>
						<AlertDescription className="whitespace-pre-line">
							{app.reviewNote}
						</AlertDescription>
					</Alert>
				) : null}

				<Separator />

				<div className="flex flex-col gap-2">
					<Button
						type="button"
						variant="ghost"
						aria-expanded={credentialsOpen}
						aria-controls={credentialsId}
						onClick={() => {
							setCredentialsOpen((open) => {
								if (open) setSecretVisible(false);
								return !open;
							});
						}}
						className={cn(
							"h-auto w-full justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-2.5 py-2 text-muted-foreground hover:bg-muted/60",
							credentialsOpen && "bg-muted/50",
						)}
					>
						<span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
							<KeyRoundIcon className="size-3.5 shrink-0" />
							<span className="truncate">{t("credentialsTitle")}</span>
						</span>
						<ChevronDownIcon
							className={cn(
								"size-4 shrink-0 transition-transform duration-200",
								credentialsOpen && "rotate-180",
							)}
						/>
					</Button>
					{credentialsOpen ? (
						<div
							id={credentialsId}
							className="flex flex-col gap-2 animate-in fade-in-0 slide-in-from-top-1 duration-150"
						>
							<CredentialRow
								label={t("clientIdLabel")}
								value={app.clientId}
								onCopy={() => void copy(app.clientId)}
								copyLabel={t("copy")}
							/>
							<CredentialRow
								label={t("clientSecretLabel")}
								value={app.clientSecret}
								masked={!secretVisible}
								onToggleVisibility={() => setSecretVisible((value) => !value)}
								revealLabel={secretVisible ? t("hideSecret") : t("showSecret")}
								onCopy={() => void copy(app.clientSecret)}
								copyLabel={t("copy")}
							/>
							<p className="text-xs text-muted-foreground">
								{t("credentialsHint")}
							</p>
						</div>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}
