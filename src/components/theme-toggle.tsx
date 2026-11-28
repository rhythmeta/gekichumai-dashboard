"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Light/dark switch for the sidebar; next-themes owns the actual theme. */
export function ThemeToggle({ className }: { className?: string }) {
	const { t } = useTranslation("sidebar");
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const isDark = mounted && resolvedTheme === "dark";

	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			className={cn("shrink-0", className)}
			aria-label={t("toggleTheme")}
			title={t("toggleTheme")}
			onClick={() => setTheme(isDark ? "light" : "dark")}
		>
			{isDark ? <SunIcon /> : <MoonIcon />}
		</Button>
	);
}
