import assert from "node:assert/strict";
import { test } from "node:test";
import {
  backupChartKey,
  decodeBackupSnapshot,
  encodeBackupSnapshot,
  gzipBackupSnapshot,
} from "../src/lib/backup-snapshot.ts";

const MAGIC = "RHYTHMETA_BACKUP";

function profile(overrides) {
  return {
    id: "",
    name: "",
    server: "",
    avatar: null,
    avatarUrl: "",
    active: false,
    createdAt: 0,
    dfUsername: "",
    playerRating: 0,
    plate: "",
    title: "",
    ...overrides,
  };
}

function score(overrides) {
  return {
    profileId: "",
    chartKey: "",
    achievement: 0,
    rank: "",
    dxScore: 0,
    fc: "",
    fs: "",
    achievedAt: 0,
    score: 0,
    clear: "",
    songId: "",
    ...overrides,
  };
}

function snapshot(overrides) {
  return {
    magic: MAGIC,
    formatVersion: 1,
    game: "maimaid",
    createdAt: 1_760_000_000_000,
    clientVersion: "fixture-1",
    profiles: [],
    scores: [],
    playRecords: [],
    favoriteSongIds: [],
    ...overrides,
  };
}

test("round-trips profiles, scores and play records through gzip", async () => {
  const profiles = [
    profile({
      id: "10000000-0000-4000-8000-000000000001",
      name: "Test 玩家",
      server: "jp",
      avatar: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]),
      avatarUrl: "https://example.com/avatar.png",
      active: true,
      createdAt: 1_760_000_000_000,
      dfUsername: "test_df",
      playerRating: 14_521,
      plate: "金色",
      title: "称号",
    }),
    profile({
      id: "10000000-0000-4000-8000-000000000002",
      name: "Second",
      server: "cn",
      avatar: null,
      avatarUrl: "",
      active: false,
      createdAt: 1_760_000_000_001,
      dfUsername: "second_df",
      playerRating: 0,
      plate: "",
      title: "",
    }),
  ];
  const scores = [
    score({
      profileId: profiles[0].id,
      chartKey: backupChartKey("maimaid", "525", "std", "master"),
      achievement: 100.5123,
      rank: "sssp",
      dxScore: 2_012,
      fc: "ap",
      fs: "fsd",
      achievedAt: 1_760_000_000_100,
      score: 1_009_000,
      clear: "clear",
      songId: "525",
    }),
    score({
      profileId: profiles[0].id,
      chartKey: backupChartKey("chunithmd", "8349", "we", "ultima"),
      achievement: 1_009_000,
      rank: "sss",
      dxScore: 0,
      fc: "",
      fs: "fsd",
      achievedAt: 0,
      score: 0,
      clear: "",
      songId: "8349",
    }),
    score({ profileId: profiles[1].id, songId: "8349", chartKey: "4:8349" }),
  ];
  const original = snapshot({
    profiles,
    scores,
    playRecords: [
      { id: "play-1", result: scores[0] },
      { id: "play-2", result: scores[1] },
    ],
    favoriteSongIds: ["10181", "8349"],
  });

  const compressed = await gzipBackupSnapshot(encodeBackupSnapshot(original));
  assert.equal(compressed[0], 0x1f);
  assert.equal(compressed[1], 0x8b);

  const decoded = await decodeBackupSnapshot(compressed);
  assert.deepEqual(decoded, original);
  assert.equal(decoded.scores[0].achievement, 100.5123);
  assert.deepEqual(decoded.profiles[0].avatar, profiles[0].avatar);
  assert.equal(decoded.profiles[0].name, "Test 玩家");
  assert.deepEqual(decoded.favoriteSongIds, ["10181", "8349"]);
});

test("decodes an uncompressed snapshot from Uint8Array or ArrayBuffer", async () => {
  const original = snapshot({
    game: "chunithmd",
    profiles: [profile({ id: "p1", name: "Solo", active: true })],
    scores: [score({ chartKey: "8349:std:master", achievement: 1_009_000 })],
  });
  const bytes = encodeBackupSnapshot(original);

  assert.deepEqual(await decodeBackupSnapshot(bytes), original);
  assert.deepEqual(await decodeBackupSnapshot(bytes.slice().buffer), original);
});

test("backupChartKey matches both native key formats", () => {
  assert.equal(
    backupChartKey("maimaid", "525", "std", "master"),
    "3:525|std|master",
  );
  assert.equal(
    backupChartKey("maimaid", "525", "STD", "MASTER"),
    "3:525|std|master",
  );
  assert.equal(
    backupChartKey("chunithmd", "8349", "std", "master"),
    "8349:std:master",
  );
  assert.equal(
    backupChartKey("chunithmd", "8349", "STD", "ULTIMA"),
    "8349:std:ultima",
  );
  // maimaid counts UTF-16 code units: 4 for "初音ミク", 2 for one emoji.
  assert.equal(
    backupChartKey("maimaid", "初音ミク", "dx", "master"),
    "4:初音ミク|dx|master",
  );
  assert.equal(
    backupChartKey("maimaid", "🎵", "std", "master"),
    "2:🎵|std|master",
  );
});

test("rejects malformed protobuf and missing magic", async () => {
  const corrupted = [
    new Uint8Array([0x0a, 0xff]), // truncated string length varint
    new Uint8Array([0x0a, 0x05, 0x41]), // truncated string payload
    new Uint8Array([0x0f]), // unsupported wire type 7
    new Uint8Array([]), // empty message: no magic
    new Uint8Array([0x10, 0x01]), // format version without magic
    Buffer.concat([
      bytesField(1, MAGIC),
      Buffer.from([0x32, 0x02, 0x0a, 0x05]), // truncated profile string
    ]),
    Buffer.concat([
      bytesField(1, MAGIC),
      Buffer.from([0x32, 0x01, 0x00]), // profile with field number 0
    ]),
    new Uint8Array([0x1f, 0x8b, 0x00]), // gzip magic but invalid payload
  ];

  for (const bytes of corrupted) {
    await assert.rejects(() => decodeBackupSnapshot(bytes), Error);
  }
});

test("decodes play-record result nesting from raw wire bytes", async () => {
  const nestedScore = Buffer.concat([
    bytesField(1, "profile-1"),
    bytesField(2, "3:525|std|master"),
    doubleField(3, 100.5123),
    varintField(8, 1_760_000_000_500),
    bytesField(11, "525"),
  ]);
  const playRecord = Buffer.concat([
    bytesField(1, "record-1"),
    bytesField(2, nestedScore),
  ]);
  const bytes = Buffer.concat([
    bytesField(1, MAGIC),
    varintField(2, 1),
    bytesField(3, "maimaid"),
    bytesField(8, playRecord),
  ]);

  const decoded = await decodeBackupSnapshot(bytes);
  assert.equal(decoded.playRecords.length, 1);
  assert.equal(decoded.playRecords[0].id, "record-1");
  assert.deepEqual(
    decoded.playRecords[0].result,
    score({
      profileId: "profile-1",
      chartKey: "3:525|std|master",
      achievement: 100.5123,
      achievedAt: 1_760_000_000_500,
      songId: "525",
    }),
  );
});

// Native fixture generated by maimaid from shared/fixtures/maimaid-v1.pb.gz.
const nativeFixture =
  "H4sIAAAAAAAC/+MSCPKIDPHwdQ1xjHdydPYODRBglGLPTcwEohSFhvY/O/pNtDjTMitKSotSdQ2NYrhUDA0gQBdMmIAICxgXCgyFuENSi0sUnvetfLpumxRTVoGSYFpidqpuYlliSWKRblJlSWqxAaMFxPwM5QL+Cq4GRi6rKCJNFzCxAplfk1JRk5tYXJJaJPlERPbkU/ZIByWW4uLiAo073EZMiQVWzGnFKQ4QS5IMuNQS81KK8jNT9KDe00sGOiYnPz2+OL+oJD6xODk1LyUzL12IJSk/P8eAEQCoa7v9GwEAAA==";

test("decodes the native maimaid v1 gzip fixture", async () => {
  const decoded = await decodeBackupSnapshot(
    new Uint8Array(Buffer.from(nativeFixture, "base64")),
  );

  assert.equal(decoded.magic, MAGIC);
  assert.equal(decoded.formatVersion, 1);
  assert.equal(decoded.game, "maimaid");
  assert.equal(decoded.createdAt, 1_790_852_400_000);
  assert.equal(decoded.clientVersion, "fixture-1");
  assert.equal(decoded.profiles.length, 1);
  assert.deepEqual(
    decoded.profiles[0],
    profile({
      id: "10000000-0000-4000-8000-000000000001",
      name: "Test 玩家",
      server: "jp",
      avatar: new TextEncoder().encode("fake-avatar-bytes"),
      avatarUrl: "",
      active: true,
      createdAt: 1_790_852_400_000,
      dfUsername: "",
      playerRating: 0,
      plate: "",
      title: "",
    }),
  );
  assert.deepEqual(decoded.scores, [
    score({
      profileId: "10000000-0000-4000-8000-000000000001",
      chartKey: "4:Test|dx|master",
      achievement: 100.1234,
      rank: "sssp",
      dxScore: 1500,
      fc: "ap",
      fs: "fsd",
      achievedAt: 1_790_852_400_000,
      score: 0,
      clear: "",
      songId: "",
    }),
  ]);
  assert.deepEqual(decoded.playRecords, []);
});

function varint(value) {
  const bytes = [];
  let remaining = value;
  while (remaining >= 0x80) {
    bytes.push((remaining % 0x80) | 0x80);
    remaining = Math.floor(remaining / 0x80);
  }
  bytes.push(remaining);
  return Buffer.from(bytes);
}

function bytesField(field, payload) {
  const bytes = Buffer.from(payload);
  return Buffer.concat([
    Buffer.from([field * 8 + 2]),
    varint(bytes.length),
    bytes,
  ]);
}

function doubleField(field, value) {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleLE(value);
  return Buffer.concat([Buffer.from([field * 8 + 1]), bytes]);
}

function varintField(field, value) {
  return Buffer.concat([Buffer.from([field * 8]), varint(value)]);
}
