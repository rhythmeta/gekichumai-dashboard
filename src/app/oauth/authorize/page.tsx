import type { Metadata } from "next";
import { DashboardShell } from "@/components/DashboardShell";

export const metadata: Metadata = {
	title: "Rhythmeta OAuth",
	description: "Rhythmeta OAuth authorization consent",
};

export default function OAuthAuthorizePage() {
	return <DashboardShell />;
}
