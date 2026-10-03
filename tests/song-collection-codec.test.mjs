import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import {
  decodeCollectionSnapshot,
  resolveSharedCollection,
  collectionSegmentFromPathname,
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

test("only accepts MMD2, without attempting cloud requests", async () => {
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
