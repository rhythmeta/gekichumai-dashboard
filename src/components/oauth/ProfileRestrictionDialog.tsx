"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SaveIcon } from "lucide-react";
import type { RequestFn } from "@/App";
import { ProfilePicker } from "@/components/oauth/ProfilePicker";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	OAUTH_GAMES,
	readScopeGames,
	type OAuthAuthorization,
	type OAuthGame,
	type ProfileRestrictions,
} from "@/lib/oauth-types";

type ProfileRestrictionDialogProps = {
	authorization: OAuthAuthorization;
	request: RequestFn;
	onOpenChange: (open: boolean) => void;
	onSaved: (authorization: OAuthAuthorization) => void;
};

/** Restrict which profiles of the latest backup an authorized app may touch. */
export function ProfileRestrictionDialog({
	authorization,
	request,
	onOpenChange,
	onSaved,
}: ProfileRestrictionDialogProps) {
	const { t } = useTranslation("oauthApps");
	const readGames = readScopeGames(authorization.scopes);
	const [selection, setSelection] = useState<
		Partial<Record<OAuthGame, string[]>>
	>(() => {
		const initial: Partial<Record<OAuthGame, string[]>> = {};
		for (const game of OAUTH_GAMES) {
			initial[game] = [...(authorization.profileRestrictions[game] ?? [])];
		}
		return initial;
	});
	const [available, setAvailable] = useState<
		Partial<Record<OAuthGame, string[]>>
	>({});
	const [saving, setSaving] = useState(false);

	const save = async () => {
		setSaving(true);
		try {
			const profileRestrictions: ProfileRestrictions = {};
			for (const game of readGames) {
				const availableIds = available[game];
				const selected = selection[game] ?? [];
				profileRestrictions[game] = availableIds
					? selected.filter((id) => availableIds.includes(id))
					: selected;
			}
			const result = await request<{ authorization: OAuthAuthorization }>(
				`auth/v1/oauth/authorizations/${encodeURIComponent(authorization.id)}`,
				{ method: "PATCH", body: { profileRestrictions } },
			);
			toast.success(t("dataScopeSaved"));
			onSaved(result.authorization);
			onOpenChange(false);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{t("dataScopeDialogTitle")}</DialogTitle>
					<DialogDescription>
						{t("dataScopeDialogDesc", { name: authorization.app.name })}
					</DialogDescription>
					<p className="text-xs text-muted-foreground">
						{t("dataScopePrivacyHint")}
					</p>
				</DialogHeader>

				<div className="flex flex-col gap-5">
					{readGames.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{t("noDataScopeGame")}
						</p>
					) : null}
					{readGames.map((game) => (
						<section key={game} className="flex flex-col gap-2">
							<h3 className="text-sm font-medium">{game}</h3>
							<ProfilePicker
								request={request}
								game={game}
								ns="oauthApps"
								selected={selection[game] ?? []}
								onAvailableProfiles={(ids) =>
									setAvailable((previous) => ({ ...previous, [game]: ids }))
								}
								onChange={(next) =>
									setSelection((previous) => ({ ...previous, [game]: next }))
								}
							/>
						</section>
					))}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={saving}
						onClick={() => onOpenChange(false)}
					>
						{t("cancel")}
					</Button>
					<Button type="button" disabled={saving} onClick={() => void save()}>
						<SaveIcon data-icon="inline-start" />
						{saving ? t("saving") : t("save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
