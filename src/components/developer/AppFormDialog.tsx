"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	GlobeIcon,
	InfoIcon,
	MonitorSmartphoneIcon,
	PlusIcon,
	Trash2Icon,
	UploadIcon,
	XIcon,
} from "lucide-react";
import type { RequestFn } from "@/App";
import { OAuthAppIcon } from "@/components/oauth/OAuthAppIcon";
import { ScopeSelector } from "./ScopeSelector";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	isValidIconDataUrl,
	normalizeRedirectUriList,
	normalizeScopes,
	OAUTH_DESCRIPTION_MAX,
	OAUTH_ICON_DATA_URL_MAX,
	OAUTH_ICON_MAX_BYTES,
	OAUTH_NAME_MAX,
	OAUTH_REDIRECT_URI_LIMIT,
	OAUTH_WEBSITE_MAX,
	validateRedirectUri,
	validateWebsiteUrl,
	type OAuthApp,
	type OAuthAppInput,
	type OAuthScope,
} from "@/lib/oauth-types";
import { cn } from "@/lib/utils";

type FieldErrors = Partial<
	Record<
		"name" | "description" | "websiteUrl" | "icon" | "redirectUris" | "scopes",
		string
	>
>;

type AppFormDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** `null` creates a new app, otherwise edits the given one. */
	app: OAuthApp | null;
	request: RequestFn;
	onSaved: (app: OAuthApp) => void | Promise<void>;
};

type RedirectUriRow = { id: string; value: string };

type AppAuthMethod = "redirect" | "device";

let redirectUriRowSequence = 0;

/** Stable per-row id so deleting a middle row never remounts/relabels others. */
function createRedirectUriRow(value: string): RedirectUriRow {
	redirectUriRowSequence += 1;
	return { id: `redirect-uri-${redirectUriRowSequence}`, value };
}

export function AppFormDialog({
	open,
	onOpenChange,
	app,
	request,
	onSaved,
}: AppFormDialogProps) {
	const { t } = useTranslation("developer");
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [websiteUrl, setWebsiteUrl] = useState("");
	const [iconDataUrl, setIconDataUrl] = useState("");
	const [authMethod, setAuthMethod] = useState<AppAuthMethod>("redirect");
	const [redirectUris, setRedirectUris] = useState<RedirectUriRow[]>(() => [
		createRedirectUriRow(""),
	]);
	const [scopes, setScopes] = useState<OAuthScope[]>([]);
	const [errors, setErrors] = useState<FieldErrors>({});
	const [submitting, setSubmitting] = useState(false);
	const nameInputRef = useRef<HTMLInputElement>(null);
	const websiteInputRef = useRef<HTMLInputElement>(null);
	const redirectInputRef = useRef<HTMLInputElement>(null);
	const scopeSectionRef = useRef<HTMLDivElement>(null);

	const focusFirstError = (nextErrors: FieldErrors) => {
		if (nextErrors.name) {
			nameInputRef.current?.focus();
			return;
		}
		if (nextErrors.websiteUrl) {
			websiteInputRef.current?.focus();
			return;
		}
		if (nextErrors.redirectUris) {
			redirectInputRef.current?.focus();
			return;
		}
		if (nextErrors.scopes) {
			scopeSectionRef.current?.scrollIntoView({ block: "center" });
		}
	};

	useEffect(() => {
		if (!open) return;
		setName(app?.name ?? "");
		setDescription(app?.description ?? "");
		setWebsiteUrl(app?.websiteUrl ?? "");
		setIconDataUrl(app?.iconDataUrl ?? "");
		// No registered redirect URI means the app uses the device flow.
		setAuthMethod(
			app && app.redirectUris.length === 0 ? "device" : "redirect",
		);
		setRedirectUris(
			app && app.redirectUris.length > 0
				? app.redirectUris.map(createRedirectUriRow)
				: [createRedirectUriRow("")],
		);
		setScopes(normalizeScopes(app?.scopes ?? []));
		setErrors({});
		setSubmitting(false);
	}, [open, app]);

	const clearError = (key: keyof FieldErrors) => {
		setErrors((previous) => {
			if (!previous[key]) return previous;
			const next = { ...previous };
			delete next[key];
			return next;
		});
	};

	const handleIconFile = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		if (file.size > OAUTH_ICON_MAX_BYTES) {
			setErrors((previous) => ({ ...previous, icon: t("iconTooLarge") }));
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			const result = typeof reader.result === "string" ? reader.result : "";
			if (!result || !isValidIconDataUrl(result)) {
				setErrors((previous) => ({
					...previous,
					icon:
						result.length > OAUTH_ICON_DATA_URL_MAX
							? t("iconTooLarge")
							: t("iconInvalid"),
				}));
				return;
			}
			setIconDataUrl(result);
			clearError("icon");
		};
		reader.onerror = () => {
			setErrors((previous) => ({ ...previous, icon: t("iconReadError") }));
		};
		reader.readAsDataURL(file);
	};

	const updateRedirectUri = (id: string, value: string) => {
		setRedirectUris((previous) =>
			previous.map((row) => (row.id === id ? { ...row, value } : row)),
		);
		clearError("redirectUris");
	};

	const addRedirectUri = () => {
		setRedirectUris((previous) =>
			previous.length >= OAUTH_REDIRECT_URI_LIMIT
				? previous
				: [...previous, createRedirectUriRow("")],
		);
	};

	const removeRedirectUri = (id: string) => {
		setRedirectUris((previous) =>
			previous.length <= 1
				? previous
				: previous.filter((row) => row.id !== id),
		);
	};

	const validate = (): { errors: FieldErrors; input: OAuthAppInput } => {
		const nextErrors: FieldErrors = {};
		const trimmedName = name.trim();
		if (!trimmedName) {
			nextErrors.name = t("nameRequired");
		} else if (trimmedName.length > OAUTH_NAME_MAX) {
			nextErrors.name = t("nameTooLong", { max: OAUTH_NAME_MAX });
		}

		const trimmedDescription = description.trim();
		if (trimmedDescription.length > OAUTH_DESCRIPTION_MAX) {
			nextErrors.description = t("descriptionTooLong", {
				max: OAUTH_DESCRIPTION_MAX,
			});
		}

		const trimmedWebsite = websiteUrl.trim();
		const websiteIssue = validateWebsiteUrl(trimmedWebsite);
		if (websiteIssue === "invalid") {
			nextErrors.websiteUrl = t("websiteInvalid");
		} else if (websiteIssue === "tooLong") {
			nextErrors.websiteUrl = t("websiteTooLong", { max: OAUTH_WEBSITE_MAX });
		}

		const uris =
			authMethod === "device"
				? []
				: normalizeRedirectUriList(redirectUris.map((row) => row.value));
		if (authMethod === "redirect" && uris.length === 0) {
			nextErrors.redirectUris = t("redirectRequired");
		} else if (authMethod === "redirect" && uris.length > OAUTH_REDIRECT_URI_LIMIT) {
			nextErrors.redirectUris = t("redirectTooMany", {
				max: OAUTH_REDIRECT_URI_LIMIT,
			});
		} else if (authMethod === "redirect") {
			const issue = uris
				.map((uri) => validateRedirectUri(uri))
				.find((value) => value !== null);
			if (issue === "blockedScheme") {
				nextErrors.redirectUris = t("redirectBlockedScheme");
			} else if (issue === "tooLong") {
				nextErrors.redirectUris = t("redirectTooLong");
			} else if (issue === "fragment") {
				nextErrors.redirectUris = t("redirectFragment");
			} else if (issue === "userinfo") {
				nextErrors.redirectUris = t("redirectUserinfo");
			} else if (issue) {
				nextErrors.redirectUris = t("redirectInvalid");
			}
		}

		const normalizedScopes = normalizeScopes(scopes);
		if (normalizedScopes.length === 0) {
			nextErrors.scopes = t("scopesRequired");
		}

		return {
			errors: nextErrors,
			input: {
				name: trimmedName,
				description: trimmedDescription,
				websiteUrl: trimmedWebsite || null,
				iconDataUrl: iconDataUrl || null,
				redirectUris: uris,
				scopes: normalizedScopes,
			},
		};
	};

	const submit = async () => {
		const { errors: nextErrors, input } = validate();
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) {
			focusFirstError(nextErrors);
			return;
		}
		setSubmitting(true);
		try {
			const result = app
				? await request<{ app: OAuthApp }>(
						`auth/v1/oauth/apps/${encodeURIComponent(app.id)}`,
						{ method: "PATCH", body: input },
					)
				: await request<{ app: OAuthApp }>("auth/v1/oauth/apps", {
						method: "POST",
						body: input,
					});
			toast.success(app ? t("updated") : t("created"));
			await onSaved(result.app);
			onOpenChange(false);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{app ? t("editTitle") : t("createTitle")}</DialogTitle>
					<DialogDescription>{t("formDesc")}</DialogDescription>
				</DialogHeader>

				<FieldGroup className="gap-5">
					<Field>
						<FieldLabel>{t("fieldIcon")}</FieldLabel>
						<div className="flex flex-wrap items-center gap-3">
							<OAuthAppIcon
								name={name || "?"}
								iconDataUrl={iconDataUrl || null}
								size="lg"
							/>
							<div className="flex flex-wrap gap-2">
								<Button type="button" variant="outline" size="sm" asChild>
									<label htmlFor="oauth-app-icon" className="cursor-pointer">
										<UploadIcon data-icon="inline-start" />
										{t("iconUpload")}
									</label>
								</Button>
								<input
									id="oauth-app-icon"
									type="file"
									accept="image/*"
									className="sr-only"
									onChange={handleIconFile}
								/>
								{iconDataUrl ? (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => {
											setIconDataUrl("");
											clearError("icon");
										}}
									>
										<XIcon data-icon="inline-start" />
										{t("iconRemove")}
									</Button>
								) : null}
							</div>
						</div>
						{errors.icon ? (
							<p className="text-sm text-destructive">{errors.icon}</p>
						) : (
							<p className="text-xs text-muted-foreground">{t("iconHint")}</p>
						)}
					</Field>

					<div className="grid gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="oauth-app-name">
								{t("fieldName")}
							</FieldLabel>
							<Input
								id="oauth-app-name"
								ref={nameInputRef}
								value={name}
								maxLength={OAUTH_NAME_MAX}
								placeholder={t("fieldNamePlaceholder")}
								aria-invalid={Boolean(errors.name)}
								onChange={(event) => {
									setName(event.target.value);
									clearError("name");
								}}
							/>
							{errors.name ? (
								<p className="text-sm text-destructive">{errors.name}</p>
							) : (
								<p className="text-xs text-muted-foreground">
									{t("fieldNameHint")}
								</p>
							)}
						</Field>

						<Field>
							<FieldLabel htmlFor="oauth-app-website">
								{t("fieldWebsite")}
							</FieldLabel>
							<Input
								id="oauth-app-website"
								ref={websiteInputRef}
								value={websiteUrl}
								placeholder={t("fieldWebsitePlaceholder")}
								aria-invalid={Boolean(errors.websiteUrl)}
								onChange={(event) => {
									setWebsiteUrl(event.target.value);
									clearError("websiteUrl");
								}}
							/>
							{errors.websiteUrl ? (
								<p className="text-sm text-destructive">
									{errors.websiteUrl}
								</p>
							) : (
								<p className="text-xs text-muted-foreground">
									{t("fieldWebsiteHint")}
								</p>
							)}
						</Field>
					</div>

					<Field>
						<FieldLabel htmlFor="oauth-app-description">
							{t("fieldDescription")}
						</FieldLabel>
						<Textarea
							id="oauth-app-description"
							value={description}
							maxLength={OAUTH_DESCRIPTION_MAX}
							placeholder={t("fieldDescriptionPlaceholder")}
							aria-invalid={Boolean(errors.description)}
							onChange={(event) => {
								setDescription(event.target.value);
								clearError("description");
							}}
						/>
						{errors.description ? (
							<p className="text-sm text-destructive">{errors.description}</p>
						) : (
							<p className="text-xs text-muted-foreground">
								{t("fieldDescriptionHint", {
									amount: description.trim().length,
									max: OAUTH_DESCRIPTION_MAX,
								})}
							</p>
						)}
					</Field>

					<Field>
						<FieldLabel>{t("fieldAuthMethod")}</FieldLabel>
						<div className="grid gap-2 sm:grid-cols-2">
							{(
								[
									{
										value: "redirect" as const,
										icon: GlobeIcon,
										title: t("authMethodRedirect"),
										description: t("authMethodRedirectDesc"),
									},
									{
										value: "device" as const,
										icon: MonitorSmartphoneIcon,
										title: t("authMethodDevice"),
										description: t("authMethodDeviceDesc"),
									},
								] satisfies Array<{
									value: AppAuthMethod;
									icon: typeof GlobeIcon;
									title: string;
									description: string;
								}>
							).map((option) => {
								const selected = authMethod === option.value;
								const select = () => {
									setAuthMethod(option.value);
									clearError("redirectUris");
								};
								return (
									<div
										key={option.value}
										role="radio"
										aria-checked={selected}
										tabIndex={submitting ? -1 : 0}
										onClick={select}
										onKeyDown={(event) => {
											if (event.key === " " || event.key === "Enter") {
												event.preventDefault();
												select();
											}
										}}
										className={cn(
											"flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
											selected
												? "border-primary/50 bg-primary/5"
												: "hover:bg-muted/60",
										)}
									>
										<span
											className={cn(
												"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
												selected
													? "bg-primary/15 text-primary"
													: "bg-muted text-muted-foreground",
											)}
										>
											<option.icon className="size-4" />
										</span>
										<div className="min-w-0">
											<p className="text-sm font-medium">{option.title}</p>
											<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
												{option.description}
											</p>
										</div>
									</div>
								);
							})}
						</div>
						<p className="text-xs text-muted-foreground">
							{t("fieldAuthMethodHint")}
						</p>
					</Field>

					{authMethod === "redirect" ? (
						<Field>
							<FieldLabel>{t("fieldRedirectUris")}</FieldLabel>
							<div className="flex flex-col gap-2">
								{redirectUris.map((row, index) => (
									<div key={row.id} className="flex items-center gap-2">
										<Input
											ref={index === 0 ? redirectInputRef : undefined}
											value={row.value}
											placeholder={t("redirectUriPlaceholder")}
											aria-label={t("redirectUriLabel", { index: index + 1 })}
											aria-invalid={Boolean(errors.redirectUris)}
											onChange={(event) =>
												updateRedirectUri(row.id, event.target.value)
											}
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											aria-label={t("removeRedirectUri")}
											disabled={redirectUris.length <= 1}
											onClick={() => removeRedirectUri(row.id)}
										>
											<Trash2Icon />
										</Button>
									</div>
								))}
							</div>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={redirectUris.length >= OAUTH_REDIRECT_URI_LIMIT}
									onClick={addRedirectUri}
								>
									<PlusIcon data-icon="inline-start" />
									{t("addRedirectUri")}
								</Button>
								<p
									className={cn(
										"text-xs",
										errors.redirectUris
											? "text-destructive"
											: "text-muted-foreground",
									)}
								>
									{errors.redirectUris ?? t("fieldRedirectUrisHint")}
								</p>
							</div>
						</Field>
					) : (
						<Alert>
							<InfoIcon />
							<AlertTitle>{t("authMethodDevice")}</AlertTitle>
							<AlertDescription>{t("deviceFlowHint")}</AlertDescription>
						</Alert>
					)}

					<Field ref={scopeSectionRef}>
						<FieldLabel>{t("fieldScopes")}</FieldLabel>
						<ScopeSelector value={scopes} onChange={setScopes} />
						{errors.scopes ? (
							<p className="text-sm text-destructive">{errors.scopes}</p>
						) : (
							<p className="text-xs text-muted-foreground">
								{t("fieldScopesHint")}
							</p>
						)}
					</Field>
				</FieldGroup>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={submitting}
						onClick={() => onOpenChange(false)}
					>
						{t("cancel")}
					</Button>
					<Button type="button" disabled={submitting} onClick={() => void submit()}>
						{submitting
							? t("saving")
							: app
								? t("saveChanges")
								: t("createAppAction")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
