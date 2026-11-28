"use client";

import { useState } from "react";
import { MusicIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SongCover({
	src,
	alt,
	className,
	iconClassName,
}: {
	src: string | null;
	alt: string;
	className?: string;
	iconClassName?: string;
}) {
	const [failed, setFailed] = useState(false);
	const showImage = Boolean(src) && !failed;
	return (
		<div
			className={cn(
				"relative overflow-hidden bg-muted",
				className,
			)}
		>
			{showImage ? (
				// eslint-disable-next-line @next/next/no-img-element -- remote public CDN, CSP-restricted
				<img
					src={src ?? undefined}
					alt={alt}
					loading="lazy"
					referrerPolicy="no-referrer"
					onError={() => setFailed(true)}
					className="size-full object-cover"
				/>
			) : (
				<div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/20 via-primary/5 to-accent text-primary">
					<MusicIcon className={cn("size-6 opacity-70", iconClassName)} />
				</div>
			)}
		</div>
	);
}
