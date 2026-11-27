"use client";

import { useEffect } from "react";
import App from "@/App";
import { PublicCollectionPage } from "@/components/collections/PublicCollectionPage";
import { useClientPathname } from "@/hooks/use-client-pathname";
import { syncClientLanguagePreference } from "@/lib/i18n";
import { collectionSegmentFromPathname } from "@/lib/song-collection-codec";

/**
 * Client shell shared by `src/app/page.tsx` and `src/app/oauth/authorize/page.tsx`.
 *
 * The static export emits one HTML file per real route, so both routes need to
 * boot the same SPA; the actual screen is picked from `window.location.pathname`.
 */
export function DashboardShell() {
	// Workers Static Assets serves the shell for /collection/<MMD2 or CHMD1 code>.
	const pathname = useClientPathname();
	useEffect(() => {
		syncClientLanguagePreference();
	}, []);
	if (pathname === null) return null;
	if (pathname === "/collection" || pathname.startsWith("/collection/")) {
		const segment = collectionSegmentFromPathname(pathname) ?? "";
		return <PublicCollectionPage key={segment} segment={segment} />;
	}
	return <App />;
}
