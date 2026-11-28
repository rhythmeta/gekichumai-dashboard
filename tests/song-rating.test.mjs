import assert from "node:assert/strict";
import { test } from "node:test";
import {
	chartConstant,
	chartRating,
	chunithmdRating,
	maimaidCoefficient,
	maimaidRating,
} from "../src/lib/song-rating.ts";

test("maimaid coefficient table matches RatingUtils.swift", () => {
	assert.equal(maimaidCoefficient(0), 0);
	assert.equal(maimaidCoefficient(50), 8.0);
	assert.equal(maimaidCoefficient(79.9999), 12.8);
	assert.equal(maimaidCoefficient(80), 13.6);
	assert.equal(maimaidCoefficient(97), 20.0);
	assert.equal(maimaidCoefficient(99.5), 21.1);
	assert.equal(maimaidCoefficient(100), 21.6);
	assert.equal(maimaidCoefficient(100.5), 22.4);
});

test("maimaid rating matches the native RatingUtilsTest values", () => {
	assert.equal(maimaidRating(13.0, 100.0), 280);
	assert.equal(maimaidRating(13.0, 100.5), 292);
	assert.equal(maimaidRating(13.0, 0), 0);
	assert.equal(maimaidRating(0, 100.5), 0);
});

test("chunithmd rating matches RatingCalculatorTest score bands", () => {
	assert.equal(chunithmdRating(13.0, 499_999), 0);
	assert.equal(chunithmdRating(13.0, 500_000), 0);
	assert.equal(chunithmdRating(13.0, 800_000), 4.0);
	assert.equal(chunithmdRating(13.0, 900_000), 8.0);
	assert.equal(chunithmdRating(13.0, 925_000), 10.0);
	assert.equal(chunithmdRating(13.0, 950_000), 11.5);
	assert.equal(chunithmdRating(13.0, 975_000), 13.0);
	assert.equal(chunithmdRating(13.0, 1_000_000), 14.0);
	assert.equal(chunithmdRating(13.0, 1_005_000), 14.5);
	assert.equal(chunithmdRating(13.0, 1_007_500), 15.0);
	assert.equal(chunithmdRating(13.0, 1_009_000), 15.15);
	assert.equal(chunithmdRating(13.0, 1_010_000), 15.15);
	assert.equal(chunithmdRating(13.9, 1_002_990), 15.19);
});

test("chartConstant prefers internalLevel then numeric fallbacks", () => {
	assert.equal(chartConstant("12.5", 12.5, 12), 12.5);
	assert.equal(chartConstant(null, 13.6, 13), 13.6);
	assert.equal(chartConstant(null, null, 14), 14);
	assert.equal(chartConstant(null, null, null), null);
});

test("chartRating dispatches by game", () => {
	assert.equal(chartRating("maimaid", 13, 100.5), 292);
	assert.equal(chartRating("chunithmd", 13, 1_009_000), 15.15);
});
