const MAIMAID_PREFIX = "MMD2.";
const CHUNITHMD_PREFIX = "CHMD1.";
const MAX_CHUNITHMD_TEXT_LENGTH = 200_000;

export type CollectionGame = "maimaid" | "chunithmd";

export function collectionGameFromSegment(
  segment: string,
): CollectionGame | null {
  if (segment.startsWith(MAIMAID_PREFIX)) return "maimaid";
  if (segment.startsWith(CHUNITHMD_PREFIX)) return "chunithmd";
  return null;
}
const MAX_TEXT_LENGTH = 2_000_000;
const MAX_COMPRESSED_BYTES = 1_000_000;
const MAX_RAW_BYTES = 1_000_000;
const MAX_ENTRIES = 10_000;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

export type SharedSongCollectionEntry = {
  songId: string;
  chartType: string;
  difficulty: string;
};

export type SharedSongCollection = {
  name: string;
  entries: SharedSongCollectionEntry[];
};

export type CollectionShareErrorCode = "invalid";

export class CollectionShareError extends Error {
  readonly code: CollectionShareErrorCode;
  constructor(code: CollectionShareErrorCode) {
    super(code);
    this.code = code;
    this.name = "CollectionShareError";
  }
}

function decodeBase64URL(value: string): Uint8Array {
  if (!value || !BASE64_URL_PATTERN.test(value)) {
    throw new CollectionShareError("invalid");
  }

  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new CollectionShareError("invalid");
  }

  if (binary.length > MAX_COMPRESSED_BYTES) {
    throw new CollectionShareError("invalid");
  }

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function decompressRaw(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new CollectionShareError("invalid");
  }

  try {
    const source = new Blob([compressed.slice().buffer]).stream();
    const reader = source
      .pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat))
      .getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RAW_BYTES) {
        await reader.cancel();
        throw new CollectionShareError("invalid");
      }
      chunks.push(value);
    }

    const raw = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      raw.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return raw;
  } catch (error) {
    if (error instanceof CollectionShareError) throw error;
    throw new CollectionShareError("invalid");
  }
}

function validateCollection(
  collection: SharedSongCollection,
  game: CollectionGame,
): SharedSongCollection {
  if (collection.name.length > 200 || collection.entries.length > MAX_ENTRIES) {
    throw new CollectionShareError("invalid");
  }

  for (const entry of collection.entries) {
    if (
      entry.songId.length === 0 ||
      entry.songId.length > 200 ||
      entry.chartType.length === 0 ||
      entry.chartType.length > 32 ||
      entry.difficulty.length === 0 ||
      entry.difficulty.length > 64
    ) {
      throw new CollectionShareError("invalid");
    }
  }

  if (game === "chunithmd") {
    if (
      !collection.name.trim() ||
      collection.entries.some(
        (entry) =>
          !entry.songId.trim() ||
          !entry.chartType.trim() ||
          !entry.difficulty.trim(),
      )
    )
      throw new CollectionShareError("invalid");
    const seen = new Set<string>();
    return {
      name: collection.name.trim().slice(0, 40),
      entries: collection.entries
        .map((entry) => ({
          songId: entry.songId,
          chartType: entry.chartType.toLowerCase(),
          difficulty: entry.difficulty.toLowerCase(),
        }))
        .filter((entry) => {
          const key = `${entry.songId}:${entry.chartType}:${entry.difficulty}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
    };
  }
  return collection;
}

export async function decodeCollectionSnapshot(
  segment: string,
): Promise<SharedSongCollection> {
  const game = collectionGameFromSegment(segment);
  const limit =
    game === "chunithmd" ? MAX_CHUNITHMD_TEXT_LENGTH : MAX_TEXT_LENGTH;
  if (!game || segment.length > limit) {
    throw new CollectionShareError("invalid");
  }

  try {
    const prefix = game === "chunithmd" ? CHUNITHMD_PREFIX : MAIMAID_PREFIX;
    const compressed = decodeBase64URL(segment.slice(prefix.length));
    const raw = await decompressRaw(compressed);
    const message = decodeCollectionProtobuf(raw);
    return validateCollection(
      {
        name: message.name,
        entries: message.entries.map((entry) => ({
          songId: entry.songId,
          chartType: entry.chartType,
          difficulty: entry.difficulty,
        })),
      },
      game,
    );
  } catch (error) {
    if (error instanceof CollectionShareError) throw error;
    throw new CollectionShareError("invalid");
  }
}

export const resolveSharedCollection = decodeCollectionSnapshot;

export function collectionSegmentFromPathname(pathname: string): string | null {
  const match = /^\/collection\/([^/]+)$/u.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Decoder for shared/song_collection.proto; accepts protobuf unknown fields. */
function decodeCollectionProtobuf(raw: Uint8Array): SharedSongCollection {
  const text = new TextDecoder("utf-8", { fatal: true });
  function fields(
    bytes: Uint8Array,
    consume: (field: number, data: Uint8Array) => void,
  ) {
    let offset = 0;
    function varint(): number {
      let value = 0;
      for (let shift = 0; shift < 49; shift += 7) {
        if (offset >= bytes.length) throw new CollectionShareError("invalid");
        const byte = bytes[offset++];
        value += (byte & 127) * 2 ** shift;
        if (byte < 128) return value;
      }
      throw new CollectionShareError("invalid");
    }
    function advance(count: number) {
      if (count > bytes.length - offset)
        throw new CollectionShareError("invalid");
      offset += count;
    }
    while (offset < bytes.length) {
      const tag = varint();
      const field = Math.floor(tag / 8),
        wire = tag % 8;
      if (field === 0 || field > 536870911)
        throw new CollectionShareError("invalid");
      switch (wire) {
        case 0: {
          let terminated = false;
          for (let count = 0; count < 10; count++) {
            if (offset >= bytes.length)
              throw new CollectionShareError("invalid");
            const byte = bytes[offset++];
            if (count === 9 && byte > 1)
              throw new CollectionShareError("invalid");
            if (byte < 128) {
              terminated = true;
              break;
            }
          }
          if (!terminated) throw new CollectionShareError("invalid");
          break;
        }
        case 1:
          advance(8);
          break;
        case 2: {
          const length = varint(),
            start = offset;
          advance(length);
          consume(field, bytes.subarray(start, offset));
          break;
        }
        case 5:
          advance(4);
          break;
        default:
          throw new CollectionShareError("invalid");
      }
    }
  }
  const collection: SharedSongCollection = { name: "", entries: [] };
  fields(raw, (field, data) => {
    if (field === 1) collection.name = text.decode(data);
    if (field === 2) {
      if (collection.entries.length >= MAX_ENTRIES)
        throw new CollectionShareError("invalid");
      const entry = { songId: "", chartType: "", difficulty: "" };
      fields(data, (key, value) => {
        if (key === 1) entry.songId = text.decode(value);
        if (key === 2) entry.chartType = text.decode(value);
        if (key === 3) entry.difficulty = text.decode(value);
      });
      collection.entries.push(entry);
    }
  });
  return collection;
}
