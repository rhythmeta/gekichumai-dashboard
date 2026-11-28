import type { Game } from "@/App";
import type { CatalogChart } from "@/lib/game-catalog";

/**
 * Chunithmd difficulty colours copied verbatim from the clients
 * (`CatalogStyle.swift` difficultyStyle + SongCard.kt difficultyColor,
 * WorldsEndStyle.swift / WORLDS_END_GRADIENT_COLORS, ULTIMA_STRIPE_STOPS).
 *
 * WE and ULTIMA are *gradients*, not single colours:
 * - WORLD'S END: 6-colour rainbow gradient.
 * - ULTIMA: black/red striped gradient at 135deg, repeating.
 */
export const CHUNITHMD_DIFFICULTY_COLORS: Record<string, string> = {
  basic: "#65B94A",
  advanced: "#E6BD31",
  expert: "#E34A47",
  master: "#9A50C9",
  ultima: "#E32655",
  "world's end": "#4AA8C2",
};

export const WORLDS_END_COLORS = [
  "#65B94A",
  "#E6BD31",
  "#E34A47",
  "#9A50C9",
  "#5D5D66",
  "#4AA8C2",
] as const;

/** CSS linear-gradient string shared by badges and chart cards. */
export const WORLDS_END_GRADIENT = `linear-gradient(90deg, ${WORLDS_END_COLORS.join(", ")})`;

/** ULTIMA stripe stops from SongCard.kt (positions × 100). */
export const ULTIMA_GRADIENT = [
  "#09090C 0%",
  "#09090C 20%",
  "#E32655 43%",
  "#E32655 55%",
  "#09090C 64%",
  "#09090C 83%",
  "#E32655 100%",
].join(", ");
export const ULTIMA_STRIPED_GRADIENT = `repeating-linear-gradient(135deg, ${ULTIMA_GRADIENT})`;

/** How a difficulty paints its progress dot. */
export type ProgressDotVariant = "solid" | "worlds-end" | "ultima";

/** WORLD'S END and ULTIMA use their own gradient paints, everything else a flat colour. */
export function difficultyDotVariant(
  game: Game,
  chart: CatalogChart,
): ProgressDotVariant {
  if (game !== "chunithmd") return "solid";
  if (
    chart.type.toLowerCase() === "we" ||
    chart.difficulty.toLowerCase() === "world's end"
  ) {
    return "worlds-end";
  }
  if (chart.difficulty.toLowerCase() === "ultima") return "ultima";
  return "solid";
}

export type ChartVisual = {
  /** Solid colour for a dot / border. */
  color: string;
  /** Optional CSS background (gradient) for badges/cards. */
  background: string | null;
  /** Optional CSS background for the leading dot (gradient difficulties). */
  dotBackground: string | null;
  /** Use light text on dark/gradient backgrounds. */
  lightText: boolean;
};

/**
 * WORLD'S END charts are stored as the `we` type and carry a star rating
 * (`☆`–`☆☆☆☆☆`) in place of a numeric constant.
 */
export function isWorldsEndChart(chart: CatalogChart): boolean {
  return (
    chart.type.toLowerCase() === "we" ||
    chart.difficulty.toLowerCase() === "world's end"
  );
}

/**
 * Returns the visual style for a chart. `catalogColor` is the colour already
 * resolved from the bundle (hex for maimaid, CSS name for chunithmd).
 */
export function chartVisual(
  game: Game,
  chart: CatalogChart,
  catalogColor: string | null,
): ChartVisual {
  if (game === "maimaid" && chart.type === "utage") {
    return {
      color: "#ec4899",
      background: null,
      dotBackground: null,
      lightText: false,
    };
  }
  if (game === "chunithmd") {
    if (isWorldsEndChart(chart)) {
      return {
        color: WORLDS_END_COLORS[3],
        background: WORLDS_END_GRADIENT,
        dotBackground: WORLDS_END_GRADIENT,
        lightText: true,
      };
    }
    if (chart.difficulty.toLowerCase() === "ultima") {
      return {
        color: CHUNITHMD_DIFFICULTY_COLORS.ultima,
        background: ULTIMA_STRIPED_GRADIENT,
        dotBackground: ULTIMA_STRIPED_GRADIENT,
        lightText: true,
      };
    }
    const resolved =
      CHUNITHMD_DIFFICULTY_COLORS[chart.difficulty.toLowerCase()] ??
      catalogColor ??
      null;
    return {
      color: resolved ?? "#4AA8C2",
      background: null,
      dotBackground: null,
      lightText: false,
    };
  }
  return {
    color: catalogColor ?? "#94a3b8",
    background: null,
    dotBackground: null,
    lightText: false,
  };
}
