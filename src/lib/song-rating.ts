import type { Game } from "@/App";

/**
 * Single-chart Rating formulas copied 1:1 from the native clients:
 * - maimaid: `RatingUtils.calculateRating` (iOS, RatingUtils.swift)
 * - chunithmd: `calculateSingleRating` (KMP shared, RatingCalculator.kt)
 *
 * maimaid takes an achievement percentage; chunithmd takes an absolute score.
 */

// MARK: - maimaid achievement → coefficient table
const MAIMAID_BREAKPOINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [10, 1.6],
  [20, 3.2],
  [30, 4.8],
  [40, 6.4],
  [50, 8.0],
  [60, 9.6],
  [70, 11.2],
  [75, 12.0],
  [79.9999, 12.8],
  [80, 13.6],
  [90, 15.2],
  [94, 16.8],
  [96.9999, 17.6],
  [97, 20.0],
  [98, 20.3],
  [98.9999, 20.6],
  [99, 20.8],
  [99.5, 21.1],
  [99.9999, 21.4],
  [100, 21.6],
  [100.4999, 22.2],
  [100.5, 22.4],
];

export function maimaidCoefficient(achievement: number): number {
  for (let index = 0; index < MAIMAID_BREAKPOINTS.length; index += 1) {
    const current = MAIMAID_BREAKPOINTS[index]!;
    const next = MAIMAID_BREAKPOINTS[index + 1];
    if (!next || achievement < next[0]) return current[1];
  }
  return 0;
}

/** rating = floor(internalLevel * coefficient / 100 * min(achievement, 100.5)) */
export function maimaidRating(
  internalLevel: number,
  achievement: number,
): number {
  if (!(internalLevel > 0) || !(achievement > 0)) return 0;
  const coefficient = maimaidCoefficient(achievement);
  const rating =
    internalLevel * (coefficient / 100) * Math.min(achievement, 100.5);
  return Math.floor(rating + 0.000001);
}

// MARK: - chunithmd score → rating
const CHUNITHMD_SCORE_CUTOFF = 500_000;
const CHUNITHMD_SCORE_SSS_PLUS = 1_009_000;

/**
 * Each chart Rating is truncated (floor) to two decimals, matching the
 * Diving-Fish prober score-band calculation used by the CHUNITHM client.
 */
export function chunithmdRating(constant: number, score: number): number {
  if (
    !Number.isFinite(constant) ||
    constant <= 0 ||
    score < CHUNITHMD_SCORE_CUTOFF
  )
    return 0;
  const clamped = Math.min(score, CHUNITHMD_SCORE_SSS_PLUS);
  let value: number;
  if (clamped >= CHUNITHMD_SCORE_SSS_PLUS) {
    value = constant + 2.15;
  } else if (clamped >= 1_007_500) {
    value = constant + 2.0 + (clamped - 1_007_500) / 10_000;
  } else if (clamped >= 1_005_000) {
    value = constant + 1.5 + (clamped - 1_005_000) / 5_000;
  } else if (clamped >= 1_000_000) {
    value = constant + 1.0 + (clamped - 1_000_000) / 10_000;
  } else if (clamped >= 975_000) {
    value = constant + (clamped - 975_000) / 25_000;
  } else if (clamped >= 925_000) {
    value = constant - 3.0 + ((clamped - 925_000) * 3.0) / 50_000;
  } else if (clamped >= 900_000) {
    value = constant - 5.0 + (clamped - 900_000) / 12_500;
  } else if (clamped >= 800_000) {
    value = ((constant - 5.0) * (clamped - 700_000)) / 200_000;
  } else {
    value = ((constant - 5.0) * (clamped - 500_000)) / 600_000;
  }
  return Math.floor(Math.max(0, value) * 100 + 1e-9) / 100;
}

export function chartRating(
  game: Game,
  constant: number,
  value: number,
): number {
  return game === "maimaid"
    ? maimaidRating(constant, value)
    : chunithmdRating(constant, value);
}

/** The constant (定数) used by the rating formula for a chart. */
export function chartConstant(
  internalLevel: string | null,
  internalLevelValue: number | null,
  levelValue: number | null,
): number | null {
  if (internalLevel) {
    const parsed = Number.parseFloat(internalLevel);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (
    internalLevelValue !== null &&
    Number.isFinite(internalLevelValue) &&
    internalLevelValue > 0
  )
    return internalLevelValue;
  if (levelValue !== null && Number.isFinite(levelValue) && levelValue > 0)
    return levelValue;
  return null;
}

/** CHUNITHM full-combo lamp labels as stored in a backup. */
export function displayFullCombo(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "ajc" || normalized === "alljusticecritical") return "AJC";
  if (normalized === "aj" || normalized === "alljustice") return "AJ";
  if (normalized === "fc" || normalized === "fullcombo") return "FC";
  return "";
}

/**
 * "OVER POWER" points of a single chart, copied from the client's
 * `OverPowerCalculator` (`~/Projects/chunithmd`, shared). One OP unit is 1/200
 * so the half-hundredth precision survives the aggregation math.
 */
export function chunithmdOverPower(
  constant: number,
  score: number,
  fullCombo: string | null | undefined,
): number {
  if (!(constant > 0) || !(score > 0) || !Number.isFinite(score)) return 0;
  const base = Math.round(constant * 10) * 100;
  const lamp = displayFullCombo(fullCombo);
  const lampUnits =
    lamp === "AJC" ? 250 : lamp === "AJ" ? 200 : lamp === "FC" ? 100 : 0;
  if (score >= 1_010_000) return (base + 3_000) / 200;
  let units: number;
  if (score >= 1_007_500) {
    units = base + 2_000 + ((score - 1_007_500) * 3) / 10;
  } else if (score >= 1_005_000) {
    units = base + 1_500 + (score - 1_005_000) / 5;
  } else if (score >= 1_000_000) {
    units = base + 1_000 + (score - 1_000_000) / 10;
  } else if (score >= 975_000) {
    units = base + (score - 975_000) / 25;
  } else {
    const atA = Math.max(base - 5_000, 0);
    let below: number;
    if (score >= 900_000) {
      below = atA + ((base - atA) * (score - 900_000)) / 75_000;
    } else if (score >= 800_000) {
      below = (atA * (score - 700_000)) / 200_000;
    } else if (score >= 500_000) {
      below = (atA * (score - 500_000)) / 600_000;
    } else {
      below = 0;
    }
    units = Math.trunc(below / 10) * 10;
  }
  return (units + lampUnits) / 200;
}
