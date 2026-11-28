import assert from "node:assert/strict";
import { test } from "node:test";
import {
	calculateTolerance,
	chunithmdTolerance,
	maimaidTolerance,
	MAX_TARGET,
	RANK_PRESETS,
	rankForTarget,
} from "../src/lib/score-tolerance.ts";

const notes = (overrides = {}) => ({
	tap: null,
	hold: null,
	slide: null,
	touch: null,
	break: null,
	air: null,
	flick: null,
	total: null,
	...overrides,
});

// ── maimaid: id 12025 「魔法仕掛けのファンタジア」 DX MASTER ──────────────
// W = 620*1 + 97*2 + 87*3 + 105*1 + 146*5 = 1910
// SSS+ (100.5%): GREAT 47 / GOOD 19 / MISS 9 (user-provided expected values)
const maimaiNotes = notes({
	tap: 620,
	hold: 97,
	slide: 87,
	touch: 105,
	break: 146,
	total: 1055,
});

test("maimaid SSS+ tolerance matches the native app (47/19/9)", () => {
	assert.deepEqual(maimaidTolerance(maimaiNotes, 100.5), {
		first: 47,
		second: 19,
		miss: 9,
	});
});

test("maimaid target at/above 101% allows no errors", () => {
	assert.deepEqual(maimaidTolerance(maimaiNotes, 101), {
		first: 0,
		second: 0,
		miss: 0,
	});
});

test("maimaid tolerance is capped at the TAP count", () => {
	const small = notes({ tap: 3, hold: 0, slide: 0, touch: 0, break: 0, total: 3 });
	const result = maimaidTolerance(small, 0);
	assert.equal(result.first, 3);
	assert.equal(result.second, 3);
	assert.equal(result.miss, 3);
});

test("maimaid zero weights yield zeros", () => {
	assert.deepEqual(maimaidTolerance(notes(), 100.5), {
		first: 0,
		second: 0,
		miss: 0,
	});
});

// ── chunithmd: 「On And On!!」 MASTER (total 1496) ───────────────────────
// SSS+ (1,009,000): JUSTICE 149 / ATTACK 2 / MISS 1 (user-provided)
const chuniNotes = notes({
	tap: 966,
	hold: 44,
	slide: 146,
	air: 249,
	flick: 91,
	total: 1496,
});

test("chunithmd SSS+ tolerance matches the shared KMP calculator (149/2/1)", () => {
	assert.deepEqual(chunithmdTolerance(chuniNotes, 1_009_000), {
		first: 149,
		second: 2,
		miss: 1,
	});
});

test("chunithmd exact rank borders (1,000 / 2,000 / 1,010 notes)", () => {
	assert.deepEqual(chunithmdTolerance(notes({ total: 1000 }), 1_009_000), {
		first: 100,
		second: 1,
		miss: 0,
	});
	assert.deepEqual(chunithmdTolerance(notes({ total: 2000 }), 1_009_000), {
		first: 200,
		second: 3,
		miss: 1,
	});
	assert.deepEqual(chunithmdTolerance(notes({ total: 1010 }), 1_009_000), {
		first: 101,
		second: 1,
		miss: 1,
	});
	assert.deepEqual(chunithmdTolerance(notes({ total: 1009 }), 1_009_000), {
		first: 100,
		second: 1,
		miss: 0,
	});
});

test("chunithmd perfect score allows no errors", () => {
	assert.deepEqual(chunithmdTolerance(chuniNotes, MAX_TARGET.chunithmd), {
		first: 0,
		second: 0,
		miss: 0,
	});
});

test("chunithmd target 0 allows all notes to be missed", () => {
	assert.deepEqual(chunithmdTolerance(chuniNotes, 0), {
		first: 1496,
		second: 1496,
		miss: 1496,
	});
});

test("chunithmd falls back to summing note parts when total is missing", () => {
	assert.deepEqual(
		chunithmdTolerance(notes({ tap: 966, hold: 44, slide: 146, air: 249, flick: 91 }), 1_009_000),
		{ first: 149, second: 2, miss: 1 },
	);
});

// ── Shared helpers ───────────────────────────────────────────────────────
test("calculateTolerance dispatches by game", () => {
	assert.deepEqual(calculateTolerance("maimaid", maimaiNotes, 100.5), {
		first: 47,
		second: 19,
		miss: 9,
	});
	assert.deepEqual(calculateTolerance("chunithmd", chuniNotes, 1_009_000), {
		first: 149,
		second: 2,
		miss: 1,
	});
});

test("rank presets and rankForTarget match the native rank thresholds", () => {
	assert.equal(rankForTarget("maimaid", 100.5), "SSS+");
	assert.equal(rankForTarget("maimaid", 99.49), "SS");
	assert.equal(rankForTarget("maimaid", 98.49), "S+");
	assert.equal(rankForTarget("chunithmd", 1_007_500), "SSS");
	assert.equal(rankForTarget("chunithmd", 1_005_000), "SS+");
	assert.equal(RANK_PRESETS.maimaid.at(-1).label, "SSS+");
	assert.equal(RANK_PRESETS.chunithmd.at(-1).target, 1_009_000);
});
