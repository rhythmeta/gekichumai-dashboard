"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	ArrowLeftIcon,
	ExternalLinkIcon,
	InfoIcon,
	LoaderCircleIcon,
	LockIcon,
	ShieldAlertIcon,
	ShieldCheckIcon,
	TriangleAlertIcon,
	UserRoundIcon,
} from "lucide-react";
import type { RequestFn } from "@/App";
import { BackendRequestError } from "@/lib/backend-client";
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
import { Toaster } from "@/components/ui/sonner";
import type { Session } from "@/lib/session";
import {
	isSafeRedirectTarget,
	readScopeGames,
	writeScopeGames,
	type AuthorizeDecisionInput,
	type AuthorizeDecisionResponse,
	type AuthorizeInfo,
	type OAuthGame,
	type ProfileRestrictions,
} from "@/lib/oauth-types";

const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

type ConsentParams = {
	clientId: string;
	redirectUri: string;
	responseType: string;
	scopes: string[];
	state: string | null;
	codeChallenge: string;
	codeChallengeMethod: string;
};

type ConsentProblem =
	| "clientId"
	| "redirectUri"
	| "responseType"
	| "scope"
	| "codeChallenge"
	| "codeChallengeMethod";

function readConsentParams(search: string): ConsentParams {
	const params = new URLSearchParams(search);
	const read = (key: string) => (params.get(key) ?? "").trim();
	return {
		clientId: read("client_id"),
		redirectUri: read("redirect_uri"),
		responseType: read("response_type"),
		scopes: read("scope").split(/[\s,]+/u).filter(Boolean),
		state: read("state") || null,
		codeChallenge: read("code_challenge"),
		codeChallengeMethod: read("code_challenge_method") || "S256",
	};
}

function validateParams(params: ConsentParams): ConsentProblem[] {
	const problems: ConsentProblem[] = [];
	if (!params.clientId) problems.push("clientId");
	if (!params.redirectUri) problems.push("redirectUri");
	if (params.responseType !== "code") problems.push("responseType");
	if (params.scopes.length === 0) problems.push("scope");
	if (!CODE_CHALLENGE_PATTERN.test(params.codeChallenge)) {
		problems.push("codeChallenge");
	}
	if (params.codeChallengeMethod !== "S256") {
		problems.push("codeChallengeMethod");
	}
	return problems;
}

type ConsentView =
	| { status: "loading" }
	| { status: "ready"; info: AuthorizeInfo }
	| { status: "error"; code: string | null; message: string };

/** Backend OAuth error code -> i18n key (raw backend message stays secondary). */
const ERROR_CODE_I18N_KEYS: Record<string, string> = {
	invalid_redirect_uri: "errInvalidRedirectUri",
	invalid_scope: "errInvalidScope",
	app_not_found: "errAppNotFound",
	app_not_available: "errAppNotAvailable",
	invalid_request: "errInvalidRequest",
	validation_error: "errValidation",
	invalid_profile_restriction: "errProfileRestriction",
	rate_limited: "errRateLimited",
};

type OAuthConsentPageProps = {
	request: RequestFn;
	session: Session;
	onLogout: () => void | Promise<void>;
};

export function OAuthConsentPage({
	request,
	session,
	onLogout,
}: OAuthConsentPageProps) {
	const { t } = useTranslation("oauthConsent");
	const [params] = useState<ConsentParams | null>(() =>
		typeof window === "undefined"
			? null
			: readConsentParams(window.location.search),
	);
	const problems = useMemo(
		() => (params ? validateParams(params) : []),
		[params],
	);
	const [view, setView] = useState<ConsentView>({ status: "loading" });
	const [reloadToken, setReloadToken] = useState(0);
	const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
	const [restrictions, setRestrictions] = useState<
		Partial<Record<OAuthGame, string[]>>
	>({});

	useEffect(() => {
		document.title = t("pageTitle");
	}, [t]);

	useEffect(() => {
		if (!params || problems.length > 0) return;
		let cancelled = false;
		setView({ status: "loading" });
		const search = new URLSearchParams({
			client_id: params.clientId,
			redirect_uri: params.redirectUri,
			response_type: params.responseType,
			scope: params.scopes.join(" "),
			code_challenge: params.codeChallenge,
			code_challenge_method: params.codeChallengeMethod,
		});
		if (params.state) search.set("state", params.state);
		void request<AuthorizeInfo>(`oauth/v1/authorize?${search.toString()}`, {
			auth: false,
		})
			.then((info) => {
				if (!cancelled) setView({ status: "ready", info });
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setView({
					status: "error",
					code: error instanceof BackendRequestError ? error.code : null,
					message: (error as Error).message,
				});
			});
		return () => {
			cancelled = true;
		};
	}, [params, problems.length, reloadToken, request]);

	const submit = async (decision: "approve" | "deny") => {
		if (!params || view.status !== "ready") return;
		setSubmitting(decision);
		try {
			const profileRestrictions: ProfileRestrictions = {};
			for (const game of readScopeGames(view.info.scopes)) {
				const selection = restrictions[game] ?? [];
				if (selection.length > 0) {
					profileRestrictions[game] = selection;
				}
			}
			const body: AuthorizeDecisionInput = {
				clientId: params.clientId,
				redirectUri: view.info.redirectUri,
				scopes: view.info.scopes,
				state: view.info.state,
				codeChallenge: params.codeChallenge,
				codeChallengeMethod: "S256",
				decision,
				...(decision === "approve" &&
				Object.keys(profileRestrictions).length > 0
					? { profileRestrictions }
					: {}),
			};
			const result = await request<AuthorizeDecisionResponse>(
				"oauth/v1/authorize",
				{ method: "POST", body },
			);
			// Defence in depth: never navigate to an unexpected or unsafe target,
			// even if the backend response were tampered with.
			if (!isSafeRedirectTarget(result.redirectUrl, view.info.redirectUri)) {
				toast.error(t("unsafeRedirect"));
				setSubmitting(null);
				return;
			}
			window.location.assign(result.redirectUrl);
		} catch (error) {
			const code = error instanceof BackendRequestError ? error.code : null;
			const errorKey = code ? ERROR_CODE_I18N_KEYS[code] : undefined;
			toast.error(errorKey ? t(errorKey) : (error as Error).message);
			setSubmitting(null);
		}
	};

	if (params === null) {
		return null;
	}

	if (problems.length > 0) {
		const problemLabels: Record<ConsentProblem, string> = {
			clientId: t("problemClientId"),
			redirectUri: t("problemRedirectUri"),
			responseType: t("problemResponseType"),
			scope: t("problemScope"),
			codeChallenge: t("problemCodeChallenge"),
			codeChallengeMethod: t("problemCodeChallengeMethod"),
		};
		return (
			<ConsentLayout>
				<Card className="w-full">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<TriangleAlertIcon className="size-4 text-destructive" />
							{t("invalidRequestTitle")}
						</CardTitle>
						<CardDescription>{t("invalidRequestDesc")}</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
							{problems.map((problem) => (
								<li key={problem}>{problemLabels[problem]}</li>
							))}
						</ul>
					</CardContent>
					<CardFooter>
						<Button type="button" variant="outline" asChild>
							<Link href="/">
								<ArrowLeftIcon data-icon="inline-start" />
								{t("back")}
							</Link>
						</Button>
					</CardFooter>
				</Card>
				<Toaster />
			</ConsentLayout>
		);
	}

	if (view.status === "loading") {
		return (
			<ConsentLayout>
				<Card className="w-full">
					<CardContent className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
						<LoaderCircleIcon className="size-5 animate-spin" />
						{t("loading")}
					</CardContent>
				</Card>
				<Toaster />
			</ConsentLayout>
		);
	}

	if (view.status === "error") {
		return (
			<ConsentLayout>
				<Card className="w-full">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<TriangleAlertIcon className="size-4 text-destructive" />
							{t("loadFailedTitle")}
						</CardTitle>
						<CardDescription>{t("loadFailedDesc")}</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						<Alert variant="destructive">
							<InfoIcon />
							<AlertDescription>
								{view.code && ERROR_CODE_I18N_KEYS[view.code]
									? t(ERROR_CODE_I18N_KEYS[view.code])
									: t("errGeneric")}
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
							onClick={() => setReloadToken((value) => value + 1)}
						>
							{t("retry")}
						</Button>
						<Button type="button" variant="ghost" asChild>
							<Link href="/">
								<ArrowLeftIcon data-icon="inline-start" />
								{t("back")}
							</Link>
						</Button>
					</CardFooter>
				</Card>
				<Toaster />
			</ConsentLayout>
		);
	}

	const { app, scopes } = view.info;
	const readGames = readScopeGames(scopes);
	const writeGames = writeScopeGames(scopes);
	const hasWriteScope = writeGames.length > 0;
	const busy = submitting !== null;

	return (
		<ConsentLayout>
			<Card className="w-full">
				<CardHeader>
					<div className="flex items-center gap-3">
						<OAuthAppIcon
							name={app.name}
							iconDataUrl={app.iconDataUrl}
							size="lg"
						/>
						<div className="min-w-0 flex-1">
							<CardTitle className="truncate text-lg">{app.name}</CardTitle>
							<CardDescription className="mt-1 flex flex-wrap items-center gap-x-2">
								<span>{t("developerLabel")}</span>
								<HandleText
									handle={app.developerHandle}
									className="font-medium text-foreground"
								/>
							</CardDescription>
						</div>
						<Badge variant="secondary" className="shrink-0">
							<ShieldCheckIcon />
							{t("oauthBadge")}
						</Badge>
					</div>
					{app.websiteUrl ? (
						<a
							href={app.websiteUrl}
							target="_blank"
							rel="noreferrer noopener"
							className="inline-flex w-fit max-w-full items-center gap-1 text-xs text-primary hover:underline"
						>
							<ExternalLinkIcon className="size-3.5 shrink-0" />
							<span className="truncate">{app.websiteUrl}</span>
						</a>
					) : null}
				</CardHeader>

				<CardContent className="flex flex-col gap-5">
					<p className="text-sm text-muted-foreground">
						{t("requestIntro", { name: app.name })}
					</p>

					<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2.5">
						<span className="flex min-w-0 items-center gap-2 text-sm">
							<UserRoundIcon className="size-4 shrink-0 text-muted-foreground" />
							<span className="text-muted-foreground">
								{t("signedInAs")}
							</span>
							<HandleText
								handle={session.user.handle}
								className="truncate font-medium"
							/>
						</span>
						<Button
							type="button"
							variant="ghost"
							size="xs"
							disabled={busy}
							onClick={() => void onLogout()}
						>
							{t("switchAccount")}
						</Button>
					</div>

					<div className="flex flex-col gap-3">
						<p className="font-heading text-sm font-medium">
							{t("requestedScopes")}
						</p>
						<ScopeList scopes={scopes} ns="oauthConsent" />
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

					{readGames.length > 0 ? (
						<div className="flex flex-col gap-2">
							<p className="font-heading text-sm font-medium">
								{t("dataScopeTitle")}
							</p>
							<p className="text-xs text-muted-foreground">
								{t("dataScopeDesc")}
							</p>
							<Accordion type="single" collapsible className="rounded-lg border px-3">
								{readGames.map((game, index) => (
									<AccordionItem
										key={game}
										value={game}
										className={index === readGames.length - 1 ? "border-b-0" : undefined}
									>
										<AccordionTrigger>{game}</AccordionTrigger>
										<AccordionContent>
											<ProfilePicker
												request={request}
												game={game}
												ns="oauthConsent"
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

					{hasWriteScope ? (
						<Alert variant="destructive">
							<ShieldAlertIcon />
							<AlertTitle>{t("riskTitle")}</AlertTitle>
							<AlertDescription>
								{t("riskWrite", { games: writeGames.join(", ") })}
							</AlertDescription>
						</Alert>
					) : null}

					<p className="text-xs break-all text-muted-foreground">
						{t("redirectHint", { url: view.info.redirectUri })}
					</p>
				</CardContent>

				<CardFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button
						type="button"
						variant="outline"
						className="w-full sm:w-auto"
						disabled={busy}
						onClick={() => void submit("deny")}
					>
						{submitting === "deny" ? t("denying") : t("deny")}
					</Button>
					<Button
						type="button"
						className="w-full sm:w-auto"
						disabled={busy}
						onClick={() => void submit("approve")}
					>
						{submitting === "approve" ? t("approving") : t("approve")}
					</Button>
				</CardFooter>
			</Card>
			<p className="text-center text-xs text-muted-foreground">
				{t("footer")}
			</p>
			<Toaster />
		</ConsentLayout>
	);
}

function ConsentLayout({ children }: { children: ReactNode }) {
	return (
		<main className="flex min-h-screen w-full items-center justify-center bg-muted/30 p-4 md:p-8">
			<div className="flex w-full max-w-xl flex-col items-center gap-4">
				{children}
			</div>
		</main>
	);
}
