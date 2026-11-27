"use client";

import { useSyncExternalStore } from "react";

function subscribeToPath(onChange: () => void) {
	window.addEventListener("popstate", onChange);
	return () => window.removeEventListener("popstate", onChange);
}

const clientPath = () => window.location.pathname;
const serverPath = () => null;

/**
 * Current browser pathname (null while prerendering the static shell).
 * Drives the SPA style routing used by `DashboardShell` and `App`.
 */
export function useClientPathname(): string | null {
	return useSyncExternalStore(subscribeToPath, clientPath, serverPath);
}
