"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Single-line text that truncates normally and scrolls (marquee) on hover or
 * keyboard focus when the content is wider than the container.
 */
export function MarqueeText({
	text,
	className,
	innerClassName,
	hoverClassName,
}: {
	text: string;
	className?: string;
	innerClassName?: string;
	/** Extra trigger classes, e.g. `group-hover/card:animate-[...]`. */
	hoverClassName?: string;
}) {
	const containerRef = useRef<HTMLSpanElement>(null);
	const [overflowing, setOverflowing] = useState(false);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		const measure = () => {
			setOverflowing(element.scrollWidth > element.clientWidth + 1);
		};
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [text]);

	if (!overflowing) {
		return (
			<span ref={containerRef} className={cn("block truncate", className)}>
				{text}
			</span>
		);
	}

	return (
		<span
			ref={containerRef}
			className={cn("group/marquee block overflow-hidden", className)}
		>
			<span className="flex w-max">
				<span
					className={cn(
						"whitespace-nowrap pr-6 group-hover/marquee:animate-[marquee-scroll_7s_linear_infinite] group-focus-within/marquee:animate-[marquee-scroll_7s_linear_infinite]",
						hoverClassName,
						innerClassName,
					)}
				>
					{text}
				</span>
				<span
					aria-hidden
					className={cn(
						"whitespace-nowrap pr-6 group-hover/marquee:animate-[marquee-scroll_7s_linear_infinite] group-focus-within/marquee:animate-[marquee-scroll_7s_linear_infinite]",
						hoverClassName,
						innerClassName,
					)}
				>
					{text}
				</span>
			</span>
		</span>
	);
}
