"use client";

import { useEffect, useSyncExternalStore } from "react";
import App from "@/App";
import { PublicCollectionPage } from "@/components/collections/PublicCollectionPage";
import { syncClientLanguagePreference } from "@/lib/i18n";
import { collectionSegmentFromPathname } from "@/lib/song-collection-codec";

function subscribeToPath(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}
const clientPath = () => window.location.pathname;
const serverPath = () => null;

export default function DashboardPage() {
  // Workers Static Assets serves this shell for /collection/<MMD2 code>.
  const pathname = useSyncExternalStore(
    subscribeToPath,
    clientPath,
    serverPath,
  );
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
