"use client";

import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const themeCycle = {
	light: { next: "dark", icon: SunIcon, label: "themeLight" },
	dark: { next: "system", icon: MoonIcon, label: "themeDark" },
	system: { next: "light", icon: MonitorIcon, label: "themeAuto" },
} as const;

export function ThemeToggle({ className }: { className?: string }) {
	const { t } = useTranslation("sidebar");
	const { theme, setTheme } = useTheme();
	const { next, icon: Icon, label } = themeCycle[theme === "light" || theme === "dark" ? theme : "system"];
	const description = t("toggleTheme", { current: t(label), next: t(themeCycle[next].label) });

	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			className={cn("shrink-0", className)}
			aria-label={description}
			title={description}
			onClick={() => setTheme(next)}
		>
			<Icon aria-hidden />
		</Button>
	);
}
