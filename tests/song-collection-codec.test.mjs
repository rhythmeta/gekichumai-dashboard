import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import {
  decodeCollectionSnapshot,
  resolveSharedCollection,
  collectionSegmentFromPathname,
  collectionGameFromSegment,
  CollectionShareError,
} from "../src/lib/song-collection-codec.ts";

const golden =
  "MMD2.4-IOyk9MUSjJVwgODhYS5GI2NDAQYkqpkGLLTSwuSS0SEuJiNgIKMReXpEixpVYUpBaVCAlzMRtDlXEUpUIUAgA";
const snapshot = (bytes) =>
  "MMD2." + deflateRawSync(Buffer.from(bytes)).toString("base64url");

test("decodes the shared Android/iOS golden fixture in entry order", async () => {
  const result = await resolveSharedCollection(golden);
  assert.equal(result.name, "Road to SSS");
  assert.deepEqual(
    result.entries.map((entry) => entry.songId),
    ["100", "200", "300"],
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.difficulty),
    ["master", "expert", "remaster"],
  );
});

test("rejects unsupported or invalid codes without attempting cloud requests", async () => {
  for (const input of [
    "96c5349c-30a7-4b85-9892-10b64e07bdb1",
    "MMD1.invalid",
    "MMD2.",
    "MMD2.invalid",
    "MMD2.a/b",
  ]) {
    await assert.rejects(resolveSharedCollection(input), CollectionShareError);
  }
});

test("rejects truncated protobuf, invalid UTF-8 and oversized inflated payloads", async () => {
  for (const bytes of [[10, 5, 65], [10, 1, 255], Buffer.alloc(1_000_001)]) {
    await assert.rejects(
      decodeCollectionSnapshot(snapshot(bytes)),
      CollectionShareError,
    );
  }
});

test("keeps empty collections and skips unknown protobuf fields", async () => {
  assert.deepEqual(await decodeCollectionSnapshot(snapshot([])), {
    name: "",
    entries: [],
  });
  assert.deepEqual(
    await decodeCollectionSnapshot(snapshot([10, 1, 65, 24, 1])),
    { name: "A", entries: [] },
  );
});

test("extracts a single collection path segment", () => {
  assert.equal(collectionSegmentFromPathname("/collection/" + golden), golden);
  for (const path of [
    "/other/" + golden,
    "/collection/" + golden + "/extra",
    "/collection/",
    "/collection/%",
  ]) {
    assert.equal(collectionSegmentFromPathname(path), null);
  }
});

const chunithmdGolden = readFileSync(
  new URL("./fixtures/chunithmd-collection.txt", import.meta.url),
  "utf8",
).trim();
const chunithmdSnapshot = (bytes) => snapshot(bytes).replace(/^MMD2/u, "CHMD1");
function field(tag, value) {
  const bytes = Buffer.from(value);
  const length = [];
  let remaining = bytes.length;
  do {
    length.push((remaining & 127) | (remaining > 127 ? 128 : 0));
    remaining >>>= 7;
  } while (remaining);
  return Buffer.concat([Buffer.from([tag * 8 + 2, ...length]), bytes]);
}

test("decodes the same CHMD1 protobuf fixture as Android, preserving unknown songs", async () => {
  assert.equal(collectionGameFromSegment(chunithmdGolden), "chunithmd");
  assert.equal(collectionGameFromSegment(golden), "maimaid");
  assert.equal(collectionGameFromSegment("CHMD2.invalid"), null);
  assert.equal(
    collectionSegmentFromPathname("/collection/" + chunithmdGolden),
    chunithmdGolden,
  );
  assert.deepEqual(await decodeCollectionSnapshot(chunithmdGolden), {
    name: "练习曲 ✨",
    entries: [
      { songId: "song-a", chartType: "std", difficulty: "master" },
      { songId: "song-b", chartType: "std", difficulty: "ultima" },
      { songId: "missing-song", chartType: "we", difficulty: "world's end" },
    ],
  });
});

test("CHMD1 matches app normalization and retains named empty collections", async () => {
  const entry = Buffer.concat([
    field(1, "unknown"),
    field(2, "STD"),
    field(3, "ULTIMA"),
  ]);
  assert.deepEqual(
    await decodeCollectionSnapshot(
      chunithmdSnapshot(
        Buffer.concat([field(1, "  练习  "), field(2, entry), field(2, entry)]),
      ),
    ),
    {
      name: "练习",
      entries: [{ songId: "unknown", chartType: "std", difficulty: "ultima" }],
    },
  );
  assert.deepEqual(
    await decodeCollectionSnapshot(chunithmdSnapshot(field(1, "空收藏夹"))),
    {
      name: "空收藏夹",
      entries: [],
    },
  );
});

test("CHMD1 rejects invalid names, entries, truncation and excessive data", async () => {
  const invalidEntry = Buffer.concat([
    field(1, " "),
    field(2, "std"),
    field(3, "master"),
  ]);
  for (const code of [
    "CHMD1.",
    "CHMD1.invalid",
    chunithmdGolden.slice(0, -5),
    "CHMD1." + "A".repeat(200_000),
    chunithmdSnapshot([]),
    chunithmdSnapshot(field(1, " ")),
    chunithmdSnapshot(field(1, "A".repeat(201))),
    chunithmdSnapshot(
      Buffer.concat([field(1, "练习"), field(2, invalidEntry)]),
    ),
    chunithmdSnapshot([10, 5, 65]),
    chunithmdSnapshot([10, 1, 255]),
    chunithmdSnapshot(Buffer.alloc(1_000_001)),
  ])
    await assert.rejects(decodeCollectionSnapshot(code), CollectionShareError);
});
