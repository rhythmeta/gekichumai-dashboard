"use client";
import { useEffect } from "react";
import App from "@/App";
import { syncClientLanguagePreference } from "@/lib/i18n";
export default function DashboardPage() {
 useEffect(() => { syncClientLanguagePreference(); }, []);
 return <App />;
}
