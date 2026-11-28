/**
 * Decoder for the native apps' cloud-backup file (`shared/backup.proto`,
 * package `rhythmeta.backup.v1`): a proto3 `Snapshot` message gzipped once.
 *
 * This file is browser-only and dependency-free: no path aliases, no React, no
 * Node APIs, so `node --test` can import it directly with type stripping.
 */

export type BackupProfile = {
  id: string;
  name: string;
  server: string;
  avatar: Uint8Array | null;
  avatarUrl: string;
  active: boolean;
  createdAt: number;
  dfUsername: string;
  playerRating: number;
  plate: string;
  title: string;
};

export type BackupScore = {
  profileId: string;
  chartKey: string;
  achievement: number;
  rank: string;
  dxScore: number;
  fc: string;
  fs: string;
  achievedAt: number;
  score: number;
  clear: string;
  songId: string;
};

export type BackupPlayRecord = { id: string; result: BackupScore };

export type BackupSnapshot = {
  magic: string;
  formatVersion: number;
  game: string;
  createdAt: number;
  clientVersion: string;
  profiles: BackupProfile[];
  scores: BackupScore[];
  playRecords: BackupPlayRecord[];
  /** Song ids the user marked as favourites in the client. */
  favoriteSongIds: string[];
};

const GZIP_MAGIC_FIRST = 0x1f;
const GZIP_MAGIC_SECOND = 0x8b;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function toUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  throw new Error("backup snapshot must be an ArrayBuffer or a Uint8Array");
}

function isGzip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 2 &&
    bytes[0] === GZIP_MAGIC_FIRST &&
    bytes[1] === GZIP_MAGIC_SECOND
  );
}

async function readAllBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
  }

  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** Gunzips when the payload starts with the gzip magic (1f 8b), then decodes. */
export async function decodeBackupSnapshot(
  bytes: ArrayBuffer | Uint8Array,
): Promise<BackupSnapshot> {
  const input = toUint8Array(bytes);
  const payload = isGzip(input) ? await gunzip(input) : input;
  return decodeSnapshotMessage(payload);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("this browser does not support DecompressionStream");
  }

  try {
    const stream = new Blob([bytes.slice()])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return await readAllBytes(stream);
  } catch {
    throw new Error("backup snapshot is not valid gzip data");
  }
}

/** Gzip with the browser/Node `CompressionStream("gzip")`. */
export async function gzipBackupSnapshot(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("this browser does not support CompressionStream");
  }

  try {
    const stream = new Blob([bytes.slice()])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    return await readAllBytes(stream);
  } catch {
    throw new Error("could not gzip the backup snapshot");
  }
}

/** Stable chart key used by both native apps. */
export function backupChartKey(
  game: "maimaid" | "chunithmd",
  songId: string,
  type: string,
  difficulty: string,
): string {
  const chartType = type.toLowerCase();
  const chartDifficulty = difficulty.toLowerCase();
  if (game === "chunithmd") {
    return `${songId}:${chartType}:${chartDifficulty}`;
  }
  // maimaid prefixes the UTF-16 code-unit length of the song id.
  return `${songId.length}:${songId}|${chartType}|${chartDifficulty}`;
}

// ---------------------------------------------------------------------------
// Proto3 wire decoding
// ---------------------------------------------------------------------------

type ProtoField =
  | { field: number; wire: 0; number: number }
  | { field: number; wire: 1; number: number }
  | { field: number; wire: 2; bytes: Uint8Array }
  | { field: number; wire: 5; number: number };

function readFields(bytes: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;

  function readVarint(): number {
    let value = 0;
    let scale = 1;
    for (let index = 0; index < 10; index += 1) {
      if (offset >= bytes.length) {
        throw new Error("truncated varint in backup snapshot");
      }
      const byte = bytes[offset];
      offset += 1;
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) return value;
      scale *= 0x80;
    }
    throw new Error("varint exceeds 10 bytes in backup snapshot");
  }

  function advance(count: number): number {
    const start = offset;
    if (count < 0 || count > bytes.length - offset) {
      throw new Error("truncated length-delimited field in backup snapshot");
    }
    offset += count;
    return start;
  }

  while (offset < bytes.length) {
    const tag = readVarint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 0)
      throw new Error("invalid field number 0 in backup snapshot");

    switch (wire) {
      case 0:
        fields.push({ field, wire: 0, number: readVarint() });
        break;
      case 1: {
        const start = advance(8);
        const view = new DataView(bytes.buffer, bytes.byteOffset + start, 8);
        fields.push({ field, wire: 1, number: view.getFloat64(0, true) });
        break;
      }
      case 2: {
        const length = readVarint();
        const start = advance(length);
        fields.push({
          field,
          wire: 2,
          bytes: bytes.subarray(start, start + length),
        });
        break;
      }
      case 5:
        advance(4);
        fields.push({ field, wire: 5, number: 0 });
        break;
      default:
        throw new Error(
          `unsupported wire type ${wire} in backup snapshot (field ${field})`,
        );
    }
  }

  return fields;
}

function asString(field: ProtoField): string {
  if (field.wire !== 2) {
    throw new Error(
      `expected wire type 2 for string field ${field.field} in backup snapshot`,
    );
  }
  try {
    return textDecoder.decode(field.bytes);
  } catch {
    throw new Error(
      `invalid UTF-8 in string field ${field.field} of backup snapshot`,
    );
  }
}

function asBytes(field: ProtoField): Uint8Array {
  if (field.wire !== 2) {
    throw new Error(
      `expected wire type 2 for message field ${field.field} in backup snapshot`,
    );
  }
  return field.bytes;
}

function asVarint(field: ProtoField): number {
  if (field.wire !== 0) {
    throw new Error(
      `expected wire type 0 for numeric field ${field.field} in backup snapshot`,
    );
  }
  return field.number;
}

function asDouble(field: ProtoField): number {
  if (field.wire !== 1) {
    throw new Error(
      `expected wire type 1 for double field ${field.field} in backup snapshot`,
    );
  }
  return field.number;
}

function emptyScore(): BackupScore {
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
  };
}

function decodeScore(bytes: Uint8Array): BackupScore {
  const score = emptyScore();
  for (const field of readFields(bytes)) {
    switch (field.field) {
      case 1:
        score.profileId = asString(field);
        break;
      case 2:
        score.chartKey = asString(field);
        break;
      case 3:
        score.achievement = asDouble(field);
        break;
      case 4:
        score.rank = asString(field);
        break;
      case 5:
        score.dxScore = asVarint(field);
        break;
      case 6:
        score.fc = asString(field);
        break;
      case 7:
        score.fs = asString(field);
        break;
      case 8:
        score.achievedAt = asVarint(field);
        break;
      case 9:
        score.score = asVarint(field);
        break;
      case 10:
        score.clear = asString(field);
        break;
      case 11:
        score.songId = asString(field);
        break;
      default:
        // Unknown/unsupported Score fields are skipped.
        break;
    }
  }
  return score;
}

function decodeProfile(bytes: Uint8Array): BackupProfile {
  const profile: BackupProfile = {
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
  };
  for (const field of readFields(bytes)) {
    switch (field.field) {
      case 1:
        profile.id = asString(field);
        break;
      case 2:
        profile.name = asString(field);
        break;
      case 3:
        profile.server = asString(field);
        break;
      case 4:
        profile.avatar = asBytes(field).slice();
        break;
      case 5:
        profile.avatarUrl = asString(field);
        break;
      case 6:
        profile.active = asVarint(field) !== 0;
        break;
      case 7:
        profile.createdAt = asVarint(field);
        break;
      case 8:
        profile.dfUsername = asString(field);
        break;
      case 9:
        profile.playerRating = asVarint(field);
        break;
      case 10:
        profile.plate = asString(field);
        break;
      case 17:
        profile.title = asString(field);
        break;
      default:
        // last_import_*, b35/b15 counters and sgwcmaid_binding are skipped.
        break;
    }
  }
  return profile;
}

function decodePlayRecord(bytes: Uint8Array): BackupPlayRecord {
  const record: BackupPlayRecord = { id: "", result: emptyScore() };
  for (const field of readFields(bytes)) {
    switch (field.field) {
      case 1:
        record.id = asString(field);
        break;
      case 2:
        record.result = decodeScore(asBytes(field));
        break;
      default:
        break;
    }
  }
  return record;
}

function decodeSnapshotMessage(bytes: Uint8Array): BackupSnapshot {
  const snapshot: BackupSnapshot = {
    magic: "",
    formatVersion: 0,
    game: "",
    createdAt: 0,
    clientVersion: "",
    profiles: [],
    scores: [],
    playRecords: [],
    favoriteSongIds: [],
  };
  for (const field of readFields(bytes)) {
    switch (field.field) {
      case 1:
        snapshot.magic = asString(field);
        break;
      case 2:
        snapshot.formatVersion = asVarint(field);
        break;
      case 3:
        snapshot.game = asString(field);
        break;
      case 4:
        snapshot.createdAt = asVarint(field);
        break;
      case 5:
        snapshot.clientVersion = asString(field);
        break;
      case 6:
        snapshot.profiles.push(decodeProfile(asBytes(field)));
        break;
      case 7:
        snapshot.scores.push(decodeScore(asBytes(field)));
        break;
      case 8:
        snapshot.playRecords.push(decodePlayRecord(asBytes(field)));
        break;
      case 11:
        snapshot.favoriteSongIds.push(asString(field));
        break;
      default:
        // collections, collection_items and settings are intentionally not
        // consumed by the dashboard.
        break;
    }
  }

  if (snapshot.magic.length === 0) {
    throw new Error("backup snapshot is missing its magic header");
  }

  return snapshot;
}

// ---------------------------------------------------------------------------
// Proto3 wire encoding (only the fields the dashboard consumes)
// ---------------------------------------------------------------------------

const VARINT_BLOCK = BigInt(0x80);
const VARINT_MASK = BigInt(0x7f);
const VARINT_SHIFT = BigInt(7);

function writeVarint(out: number[], value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error("cannot encode a non-finite protobuf number");
  }
  let remaining = BigInt(Math.trunc(value));
  if (remaining < BigInt(0)) {
    // int32/int64 negative values use 64-bit two's complement on the wire.
    remaining = BigInt.asUintN(64, remaining);
  }
  while (remaining >= VARINT_BLOCK) {
    out.push(Number(remaining & VARINT_MASK) | 0x80);
    remaining >>= VARINT_SHIFT;
  }
  out.push(Number(remaining));
}

function writeTag(out: number[], field: number, wire: number): void {
  writeVarint(out, field * 8 + wire);
}

function writeLengthDelimited(
  out: number[],
  field: number,
  bytes: Uint8Array,
): void {
  writeTag(out, field, 2);
  writeVarint(out, bytes.byteLength);
  for (const byte of bytes) out.push(byte);
}

function writeString(out: number[], field: number, value: string): void {
  if (value.length === 0) return;
  writeLengthDelimited(out, field, textEncoder.encode(value));
}

function writeNumber(out: number[], field: number, value: number): void {
  if (value === 0) return;
  writeTag(out, field, 0);
  writeVarint(out, value);
}

function writeDouble(out: number[], field: number, value: number): void {
  if (value === 0) return;
  writeTag(out, field, 1);
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, true);
  for (const byte of new Uint8Array(buffer)) out.push(byte);
}

function encodeScore(score: BackupScore): Uint8Array {
  const out: number[] = [];
  writeString(out, 1, score.profileId);
  writeString(out, 2, score.chartKey);
  writeDouble(out, 3, score.achievement);
  writeString(out, 4, score.rank);
  writeNumber(out, 5, score.dxScore);
  writeString(out, 6, score.fc);
  writeString(out, 7, score.fs);
  writeNumber(out, 8, score.achievedAt);
  writeNumber(out, 9, score.score);
  writeString(out, 10, score.clear);
  writeString(out, 11, score.songId);
  return Uint8Array.from(out);
}

function encodeProfile(profile: BackupProfile): Uint8Array {
  const out: number[] = [];
  writeString(out, 1, profile.id);
  writeString(out, 2, profile.name);
  writeString(out, 3, profile.server);
  if (profile.avatar !== null && profile.avatar.byteLength > 0) {
    writeLengthDelimited(out, 4, profile.avatar);
  }
  writeString(out, 5, profile.avatarUrl);
  if (profile.active) {
    writeTag(out, 6, 0);
    writeVarint(out, 1);
  }
  writeNumber(out, 7, profile.createdAt);
  writeString(out, 8, profile.dfUsername);
  writeNumber(out, 9, profile.playerRating);
  writeString(out, 10, profile.plate);
  writeString(out, 17, profile.title);
  return Uint8Array.from(out);
}

function encodePlayRecord(record: BackupPlayRecord): Uint8Array {
  const out: number[] = [];
  writeString(out, 1, record.id);
  writeLengthDelimited(out, 2, encodeScore(record.result));
  return Uint8Array.from(out);
}

/** Minimal proto3 writer for the same fields (used by unit tests and the dev preview fixture). */
export function encodeBackupSnapshot(snapshot: BackupSnapshot): Uint8Array {
  const out: number[] = [];
  writeString(out, 1, snapshot.magic);
  writeNumber(out, 2, snapshot.formatVersion);
  writeString(out, 3, snapshot.game);
  writeNumber(out, 4, snapshot.createdAt);
  writeString(out, 5, snapshot.clientVersion);
  for (const profile of snapshot.profiles) {
    writeLengthDelimited(out, 6, encodeProfile(profile));
  }
  for (const score of snapshot.scores) {
    writeLengthDelimited(out, 7, encodeScore(score));
  }
  for (const record of snapshot.playRecords) {
    writeLengthDelimited(out, 8, encodePlayRecord(record));
  }
  for (const songId of snapshot.favoriteSongIds ?? []) {
    writeString(out, 11, songId);
  }
  return Uint8Array.from(out);
}
