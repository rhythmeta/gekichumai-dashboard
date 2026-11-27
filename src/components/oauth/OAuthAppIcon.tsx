import { cn } from "@/lib/utils";

type OAuthAppIconProps = {
	name: string;
	iconDataUrl?: string | null;
	size?: "sm" | "default" | "lg";
	className?: string;
};

const sizeClasses = {
	sm: "size-9 text-sm",
	default: "size-11 text-base",
	lg: "size-14 text-xl",
} as const;

/**
 * App icon with a deterministic letter placeholder.
 *
 * Icons are always `data:` URLs uploaded by the developer (the CSP only allows
 * `self`/`data:` and a fixed set of asset hosts), so a plain `<img>` is correct.
 */
export function OAuthAppIcon({
	name,
	iconDataUrl,
	size = "default",
	className,
}: OAuthAppIconProps) {
	const initial = name.trim().slice(0, 1).toLocaleUpperCase() || "?";
	return (
		<div
			className={cn(
				"relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-foreground/10",
				sizeClasses[size],
				className,
			)}
		>
			{iconDataUrl ? (
				// eslint-disable-next-line @next/next/no-img-element -- data URL icon, CSP-safe
				<img
					src={iconDataUrl}
					alt=""
					className="size-full object-cover"
					referrerPolicy="no-referrer"
				/>
			) : (
				<span className="flex size-full items-center justify-center bg-gradient-to-br from-primary/25 via-primary/10 to-accent font-heading font-semibold text-primary">
					{initial}
				</span>
			)}
		</div>
	);
}
