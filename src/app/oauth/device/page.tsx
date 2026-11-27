import type { Metadata } from "next";
import { DashboardShell } from "@/components/DashboardShell";

export const metadata: Metadata = {
	title: "Rhythmeta OAuth",
	description: "Rhythmeta OAuth device authorization",
};

export default function OAuthDeviceRoute() {
	return <DashboardShell />;
}
