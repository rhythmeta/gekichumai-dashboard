"use client";

import {
	type FormEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
	ArrowLeftIcon,
	CheckCircleIcon,
	ClockIcon,
	ExternalLinkIcon,
	BanIcon,
	InfoIcon,
	LoaderCircleIcon,
	LockIcon,
	MonitorSmartphoneIcon,
	ShieldAlertIcon,
	ShieldCheckIcon,
	TriangleAlertIcon,
	UserRoundIcon,
	XCircleIcon,
} from "lucide-react";
import type { RequestFn } from "@/App";
import { OAuthAppIcon } from "@/components/oauth/OAuthAppIcon";
import { ProfilePicker } from "@/components/oauth/ProfilePicker";
import { ScopeList } from "@/components/oauth/ScopeList";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { HandleText } from "@/components/ui/handle-text";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { BackendRequestError } from "@/lib/backend-client";
import type { Session } from "@/lib/session";
import {
	isCompleteUserCode,
	sanitizeUserCodeInput,
	readScopeGames,
	writeScopeGames,
	type DeviceAuthorizationInfo,
	type DeviceDecisionInput,
	type DeviceDecisionResponse,
	type OAuthGame,
	type ProfileRestrictions,
} from "@/lib/oauth-types";

/** Backend device-flow error code -> i18n key (raw message stays secondary). */
const DEVICE_ERROR_I18N_KEYS: Record<string, string> = {
	device_code_not_found: "errNotFound",
	device_code_expired: "errExpired",
	device_code_already_used: "errAlreadyUsed",
	app_not_available: "errAppNotAvailable",
	invalid_profile_restriction: "errInvalidProfileRestriction",
	invalid_scope: "errInvalidScope",
	rate_limited: "errRateLimited",
	validation_error: "errValidation",
	unauthorized: "errUnauthorized",
};

type DeviceView =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; info: DeviceAuthorizationInfo }
	| { status: "error"; code: string | null; message: string }
	| {
			status: "result";
			decision: "approved" | "denied";
			appName: string;
	  };

type ActionError = { code: string | null; message: string };

type OAuthDevicePageProps = {
	request: RequestFn;
	session: Session;
	onLogout: () => void | Promise<void>;
};

function readInitialUserCodeInput() {
	if (typeof window === "undefined") {
		return { code: "", hasInvalidCharacters: false };
	}
	const params = new URLSearchParams(window.location.search);
	return sanitizeUserCodeInput(params.get("user_code") ?? "");
}

function clearUserCodeFromLocation() {
	if (typeof window === "undefined") return;
	const url = new URL(window.location.href);
	if (!url.searchParams.has("user_code")) return;
	url.searchParams.delete("user_code");
	window.history.replaceState(
		window.history.state,
		"",
		`${url.pathname}${url.search}${url.hash}`,
	);
}

export function OAuthDevicePage({
	request,
	session,
	onLogout,
}: OAuthDevicePageProps) {
	const { t } = useTranslation("oauthDevice");
	const [userCode, setUserCode] = useState(
		() => readInitialUserCodeInput().code,
	);
	const [draft, setDraft] = useState(() => readInitialUserCodeInput().code);
	const [inputInvalid, setInputInvalid] = useState(
		() => readInitialUserCodeInput().hasInvalidCharacters,
	);
	const [inputError, setInputError] = useState<string | null>(null);
	const [view, setView] = useState<DeviceView>({ status: "idle" });
	const [restrictions, setRestrictions] = useState<
		Partial<Record<OAuthGame, string[]>>
	>({});
	const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
	const [actionError, setActionError] = useState<ActionError | null>(null);
	const autoVerified = useRef(false);

	const describeError = useCallback(
		(code: string | null): string =>
			code && DEVICE_ERROR_I18N_KEYS[code]
				? t(DEVICE_ERROR_I18N_KEYS[code])
				: t("errGeneric"),
		[t],
	);

	const verify = useCallback(
		async (rawCode: string) => {
			const parsed = sanitizeUserCodeInput(rawCode);
			const normalized = parsed.code;
			setDraft(normalized);
			setUserCode(normalized);
			setInputInvalid(parsed.hasInvalidCharacters);
			setActionError(null);
			if (parsed.hasInvalidCharacters) {
				setView({ status: "idle" });
				setInputError(null);
				return;
			}
			if (!isCompleteUserCode(normalized)) {
				setView({ status: "idle" });
				setInputError(t("userCodeInvalid"));
				return;
			}
			setInputError(null);
			setView({ status: "loading" });
			try {
				const info = await request<DeviceAuthorizationInfo>(
					`oauth/v1/device/verify?user_code=${encodeURIComponent(normalized)}`,
				);
				clearUserCodeFromLocation();
				if (info.status === "approved" || info.status === "denied") {
					setView({
						status: "result",
						decision: info.status,
						appName: info.app.name,
					});
					return;
				}
				setRestrictions({});
				setView({ status: "ready", info });
			} catch (error) {
				setView({
					status: "error",
					code: error instanceof BackendRequestError ? error.code : null,
					message: (error as Error).message,
				});
			}
		},
		[request, t],
	);

	useEffect(() => {
		document.title = t("pageTitle");
	}, [t]);

	useEffect(() => {
		if (autoVerified.current) return;
		autoVerified.current = true;
		if (!inputInvalid && isCompleteUserCode(draft)) {
			void verify(draft);
		}
	}, [draft, inputInvalid, verify]);

	const submitCode = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void verify(draft);
	};

	const decide = async (decision: "approve" | "deny") => {
		if (view.status !== "ready") return;
		setSubmitting(decision);
		setActionError(null);
		try {
			const profileRestrictions: ProfileRestrictions = {};
			for (const game of readScopeGames(view.info.scopes)) {
				const selection = restrictions[game] ?? [];
				if (selection.length > 0) {
					profileRestrictions[game] = selection;
				}
			}
			const body: DeviceDecisionInput = {
				userCode: view.info.userCode,
				decision,
				...(decision === "approve" &&
				Object.keys(profileRestrictions).length > 0
					? { profileRestrictions }
					: {}),
			};
			const result = await request<DeviceDecisionResponse>(
				"oauth/v1/device/authorize",
				{ method: "POST", body },
			);
			setView({
				status: "result",
				decision: result.status,
				appName: view.info.app.name,
			});
		} catch (error) {
			setActionError({
				code: error instanceof BackendRequestError ? error.code : null,
				message: (error as Error).message,
			});
		} finally {
			setSubmitting(null);
		}
	};

	const resetToInput = () => {
		setView({ status: "idle" });
		setRestrictions({});
		setActionError(null);
		setInputError(null);
		setInputInvalid(sanitizeUserCodeInput(userCode).hasInvalidCharacters);
	};

	const busy = submitting !== null;

	return (
		<DeviceLayout>
			{view.status === "idle" ? (
				<Card className="w-full">
					<CardHeader>
						<div className="flex items-center gap-3">
							<span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
								<MonitorSmartphoneIcon className="size-5" />
							</span>
							<div className="min-w-0">
								<CardTitle className="text-lg">{t("title")}</CardTitle>
								<CardDescription className="mt-1">
									{t("description")}
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<AccountRow
							handle={session.user.handle}
							disabled={busy}
							onLogout={onLogout}
						/>
						<form className="flex flex-col gap-3" onSubmit={submitCode}>
							<div className="flex flex-col gap-1.5">
								<label
									htmlFor="oauth-device-user-code"
									className="text-sm font-medium"
								>
									{t("userCodeLabel")}
								</label>
								<Input
									id="oauth-device-user-code"
									value={draft}
									placeholder={t("userCodePlaceholder")}
									autoCapitalize="characters"
									autoComplete="off"
									spellCheck={false}
									maxLength={9}
									className="h-11 font-mono text-lg tracking-[0.2em] uppercase"
									aria-invalid={Boolean(inputError) || inputInvalid}
									aria-describedby="oauth-device-user-code-hint"
									onChange={(event) => {
										const parsed = sanitizeUserCodeInput(event.target.value);
										setDraft(parsed.code);
										setInputInvalid(parsed.hasInvalidCharacters);
										setInputError(null);
									}}
								/>
								<p
									id="oauth-device-user-code-hint"
									className={
										inputError || inputInvalid
											? "text-xs text-destructive"
											: "text-xs text-muted-foreground"
									}
								>
									{inputInvalid
										? t("userCodeInvalidChars")
										: (inputError ?? t("userCodeHint"))}
								</p>
							</div>
							<Button
								type="submit"
								className="w-full"
								disabled={
									busy || inputInvalid || !isCompleteUserCode(draft)
								}
							>
								{t("verify")}
							</Button>
						</form>
					</CardContent>
					<CardFooter className="justify-center">
						<p className="text-center text-xs text-muted-foreground">
							{t("footer")}
						</p>
					</CardFooter>
				</Card>
			) : null}

			{view.status === "loading" ? (
				<Card className="w-full">
					<CardContent className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
						<LoaderCircleIcon className="size-5 animate-spin" />
						{t("verifying")}
					</CardContent>
				</Card>
			) : null}

			{view.status === "error" ? (
				<Card className="w-full">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<TriangleAlertIcon className="size-4 text-destructive" />
							{t("errorTitle")}
						</CardTitle>
						<CardDescription className="font-mono text-xs tracking-[0.2em]">
							{userCode}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						<Alert variant="destructive">
							<InfoIcon />
							<AlertDescription>
								{describeError(view.code)}
							</AlertDescription>
						</Alert>
						{view.message ? (
							<p className="text-xs break-all text-muted-foreground">
								{view.message}
							</p>
						) : null}
					</CardContent>
					<CardFooter className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => void verify(userCode)}
						>
							{t("retry")}
						</Button>
						<Button type="button" variant="ghost" onClick={resetToInput}>
							{t("backToInput")}
						</Button>
					</CardFooter>
				</Card>
			) : null}

			{view.status === "result" ? (
				<Card className="w-full">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							{view.decision === "approved" ? (
								<CheckCircleIcon className="size-5 text-emerald-500" />
							) : (
								<XCircleIcon className="size-5 text-muted-foreground" />
							)}
							{view.decision === "approved"
								? t("resultApprovedTitle")
								: t("resultDeniedTitle")}
						</CardTitle>
						<CardDescription>
							{view.decision === "approved"
								? t("resultApprovedDesc", { name: view.appName })
								: t("resultDeniedDesc", { name: view.appName })}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-sm tracking-[0.2em]">
							{userCode}
						</p>
					</CardContent>
					<CardFooter className="flex flex-wrap gap-2">
						<Button type="button" variant="outline" onClick={resetToInput}>
							{t("backToInput")}
						</Button>
						<Button type="button" variant="ghost" asChild>
							<Link href="/">
								<ArrowLeftIcon data-icon="inline-start" />
								{t("back")}
							</Link>
						</Button>
					</CardFooter>
				</Card>
			) : null}

			{view.status === "ready" ? (
				<Card className="w-full">
					<CardHeader>
						<div className="flex items-center gap-3">
							<OAuthAppIcon
								name={view.info.app.name}
								iconDataUrl={view.info.app.iconDataUrl}
								size="lg"
							/>
							<div className="min-w-0 flex-1">
								<CardTitle className="truncate text-lg">
									{view.info.app.name}
								</CardTitle>
								<CardDescription className="mt-1 flex flex-wrap items-center gap-x-2">
									<span>{t("developerLabel")}</span>
									<HandleText
										handle={view.info.app.developerHandle}
										className="font-medium text-foreground"
									/>
								</CardDescription>
							</div>
							<Badge variant="secondary" className="shrink-0">
								<ShieldCheckIcon />
								{t("oauthBadge")}
							</Badge>
						</div>
						{view.info.app.websiteUrl ? (
							<a
								href={view.info.app.websiteUrl}
								target="_blank"
								rel="noreferrer noopener"
								className="inline-flex w-fit max-w-full items-center gap-1 text-xs text-primary hover:underline"
							>
								<ExternalLinkIcon className="size-3.5 shrink-0" />
								<span className="truncate">{view.info.app.websiteUrl}</span>
							</a>
						) : null}
					</CardHeader>

					<CardContent className="flex flex-col gap-5">
						<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2.5">
							<span className="flex flex-col gap-0.5">
								<span className="text-xs text-muted-foreground">
									{t("userCodeLabel")}
								</span>
								<span className="font-mono text-sm font-medium tracking-[0.2em]">
									{view.info.userCode}
								</span>
							</span>
							<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<ClockIcon className="size-3.5" />
								{formatExpiry(view.info.expiresAt, t("expiresAt"), t("expiresUnknown"))}
							</span>
						</div>

						<AccountRow
							handle={session.user.handle}
							disabled={busy}
							onLogout={onLogout}
						/>

						<p className="text-sm text-muted-foreground">
							{t("appRequestIntro", { name: view.info.app.name })}
						</p>

						<div className="flex flex-col gap-3">
							<p className="font-heading text-sm font-medium">
								{t("requestedScopes")}
							</p>
							<ScopeList scopes={view.info.scopes} ns="oauthDevice" />
							<div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 p-3">
								<LockIcon className="mt-0.5 size-4 shrink-0 text-primary" />
								<div className="min-w-0">
									<p className="text-sm font-medium">{t("privacyTitle")}</p>
									<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
										{t("privacyDesc")}
									</p>
								</div>
							</div>
						</div>

						{readScopeGames(view.info.scopes).length > 0 ? (
							<div className="flex flex-col gap-2">
								<p className="font-heading text-sm font-medium">
									{t("dataScopeTitle")}
								</p>
								<p className="text-xs text-muted-foreground">
									{t("dataScopeDesc")}
								</p>
								<Accordion type="single" collapsible className="rounded-lg border px-3">
									{readScopeGames(view.info.scopes).map((game, index, games) => (
										<AccordionItem
											key={game}
											value={game}
											className={index === games.length - 1 ? "border-b-0" : undefined}
										>
											<AccordionTrigger>{game}</AccordionTrigger>
											<AccordionContent>
												<ProfilePicker
													request={request}
													game={game}
													ns="oauthDevice"
													disabled={busy}
													selected={restrictions[game] ?? []}
													onChange={(next) =>
														setRestrictions((previous) => ({
															...previous,
															[game]: next,
														}))
													}
												/>
											</AccordionContent>
										</AccordionItem>
									))}
								</Accordion>
							</div>
						) : null}

						{writeScopeGames(view.info.scopes).length > 0 ? (
							<Alert variant="destructive">
								<ShieldAlertIcon />
								<AlertTitle>{t("riskTitle")}</AlertTitle>
								<AlertDescription>
									{t("riskWrite", {
										games: writeScopeGames(view.info.scopes).join(", "),
									})}
								</AlertDescription>
							</Alert>
						) : null}

						{actionError ? (
							<Alert variant="destructive">
								<InfoIcon />
								<AlertTitle>{t("actionErrorTitle")}</AlertTitle>
								<AlertDescription>
									<span className="block">
										{describeError(actionError.code)}
									</span>
									{actionError.message ? (
										<span className="mt-1 block text-xs break-all opacity-80">
											{actionError.message}
										</span>
									) : null}
								</AlertDescription>
							</Alert>
						) : null}
					</CardContent>

					<CardFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button
							type="button"
							variant="outline"
							className="w-full sm:w-auto"
							disabled={busy}
							onClick={() => void decide("deny")}
						>
							<BanIcon data-icon="inline-start" />
							{submitting === "deny" ? t("denying") : t("deny")}
						</Button>
						<Button
							type="button"
							className="w-full sm:w-auto"
							disabled={busy}
							onClick={() => void decide("approve")}
						>
							<ShieldCheckIcon data-icon="inline-start" />
							{submitting === "approve" ? t("allowing") : t("allow")}
						</Button>
					</CardFooter>
				</Card>
			) : null}

			<Toaster />
		</DeviceLayout>
	);
}

function DeviceLayout({ children }: { children: ReactNode }) {
	return (
		<main className="flex min-h-screen w-full items-center justify-center bg-muted/30 p-4 md:p-8">
			<div className="flex w-full max-w-xl flex-col items-center gap-4">
				{children}
			</div>
		</main>
	);
}

function AccountRow({
	handle,
	disabled,
	onLogout,
}: {
	handle: string;
	disabled: boolean;
	onLogout: () => void | Promise<void>;
}) {
	const { t } = useTranslation("oauthDevice");
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2.5">
			<span className="flex min-w-0 items-center gap-2 text-sm">
				<UserRoundIcon className="size-4 shrink-0 text-muted-foreground" />
				<span className="text-muted-foreground">{t("signedInAs")}</span>
				<HandleText handle={handle} className="truncate font-medium" />
			</span>
			<Button
				type="button"
				variant="ghost"
				size="xs"
				disabled={disabled}
				onClick={() => void onLogout()}
			>
				{t("switchAccount")}
			</Button>
		</div>
	);
}

function formatExpiry(
	value: string | null | undefined,
	template: string,
	fallback: string,
): string {
	if (!value) return fallback;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return fallback;
	return template.replace("{{time}}", date.toLocaleString());
}
