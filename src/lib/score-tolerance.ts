import type { Game } from "@/App";

/**
 * Fault-tolerance formulas copied 1:1 from the native clients:
 * - maimaid: `FaultToleranceCalculatorView` (iOS, SongDetailView.swift)
 * - chunithmd: `ScoreToleranceCalculator` (KMP shared)
 *
 * Both return, for a target rank/score, the maximum number of a single
 * judgement type allowed while every other note is perfect. The three numbers
 * are independent and must not be added together.
 */

export type RankPreset = {
	label: string;
	/** maimaid: achievement percent (e.g. 100.5). chunithmd: absolute score (e.g. 1_009_000). */
	target: number;
};

/** Ordered low → high, exactly as defined by the clients. */
export const RANK_PRESETS: Record<Game, RankPreset[]> = {
	maimaid: [
		{ label: "D", target: 0 },
		{ label: "C", target: 50 },
		{ label: "B", target: 60 },
		{ label: "BB", target: 70 },
		{ label: "BBB", target: 75 },
		{ label: "A", target: 80 },
		{ label: "AA", target: 90 },
		{ label: "AAA", target: 94 },
		{ label: "S", target: 97 },
		{ label: "S+", target: 98 },
		{ label: "SS", target: 99 },
		{ label: "SS+", target: 99.5 },
		{ label: "SSS", target: 100 },
		{ label: "SSS+", target: 100.5 },
	],
	chunithmd: [
		{ label: "D", target: 0 },
		{ label: "C", target: 500_000 },
		{ label: "B", target: 600_000 },
		{ label: "BB", target: 700_000 },
		{ label: "BBB", target: 800_000 },
		{ label: "A", target: 900_000 },
		{ label: "AA", target: 925_000 },
		{ label: "AAA", target: 950_000 },
		{ label: "S", target: 975_000 },
		{ label: "S+", target: 990_000 },
		{ label: "SS", target: 1_000_000 },
		{ label: "SS+", target: 1_005_000 },
		{ label: "SSS", target: 1_007_500 },
		{ label: "SSS+", target: 1_009_000 },
	],
};

export const MAX_TARGET: Record<Game, number> = {
	maimaid: 101,
	chunithmd: 1_010_000,
};

export type NoteCounts = {
	tap: number | null;
	hold: number | null;
	slide: number | null;
	touch: number | null;
	break: number | null;
	air: number | null;
	flick: number | null;
	total: number | null;
};

export type ToleranceResult = {
	/** maimaid: GREAT / GOOD / MISS. chunithmd: JUSTICE / ATTACK / MISS. */
	first: number;
	second: number;
	miss: number;
};

const n = (value: number | null): number => value ?? 0;
const clamp = (value: number, max: number): number =>
	Math.max(0, Math.min(value, max));

/**
 * maimaid uses note weights rather than a flat note total:
 *   W = TAP*1 + HOLD*2 + SLIDE*3 + TOUCH*1 + BREAK*5
 *   loss(GREAT) = 0.2 / W * 100, loss(GOOD) = 0.5 / W * 100, loss(MISS) = 1 / W * 100
 *   allowed = floor((101 - target) / loss), capped at TAP count.
 */
export function maimaidTolerance(
	counts: NoteCounts,
	targetAchievement: number,
): ToleranceResult {
	const weight =
		n(counts.tap) +
		n(counts.hold) * 2 +
		n(counts.slide) * 3 +
		n(counts.touch) +
		n(counts.break) * 5;
	const tapCount = n(counts.tap);
	if (weight <= 0 || tapCount <= 0) return { first: 0, second: 0, miss: 0 };
	const budget = 101 - targetAchievement;
	if (budget <= 0) return { first: 0, second: 0, miss: 0 };
	const allowance = (perNoteLoss: number): number =>
		clamp(Math.floor(budget / ((perNoteLoss / weight) * 100)), tapCount);
	return {
		first: allowance(0.2),
		second: allowance(0.5),
		miss: allowance(1),
	};
}

/**
 * chunithmd: JUSTICE CRITICAL / JUSTICE / ATTACK / MISS earn
 * 101% / 100% / 50% / 0% of each note's base score. Keep the fraction exact:
 *   lossBudget = (1_010_000 - target) * totalNotes
 *   JUSTICE = lossBudget / 10_000, ATTACK = / 510_000, MISS = / 1_010_000
 * (each capped at totalNotes).
 */
export function chunithmdTolerance(
	counts: NoteCounts,
	targetScore: number,
): ToleranceResult {
	const total = n(counts.total) > 0 ? n(counts.total) : totalFromParts(counts);
	if (total <= 0) return { first: 0, second: 0, miss: 0 };
	const budget = (1_010_000 - targetScore) * total;
	if (budget <= 0) return { first: 0, second: 0, miss: 0 };
	const allowance = (lossPerNote: number): number =>
		clamp(Math.floor(budget / lossPerNote), total);
	return {
		first: allowance(10_000),
		second: allowance(510_000),
		miss: allowance(1_010_000),
	};
}

function totalFromParts(counts: NoteCounts): number {
	return (
		n(counts.tap) +
		n(counts.hold) +
		n(counts.slide) +
		n(counts.air) +
		n(counts.flick)
	);
}

export function calculateTolerance(
	game: Game,
	counts: NoteCounts,
	target: number,
): ToleranceResult {
	return game === "maimaid"
		? maimaidTolerance(counts, target)
		: chunithmdTolerance(counts, target);
}

export function rankForTarget(game: Game, target: number): string {
	const presets = RANK_PRESETS[game];
	let label = presets[0]?.label ?? "-";
	for (const preset of presets) if (target >= preset.target) label = preset.label;
	return label;
}
