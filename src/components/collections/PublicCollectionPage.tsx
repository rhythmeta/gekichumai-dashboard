"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { DownloadIcon, Music2Icon, SmartphoneIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/ui/difficulty-badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  decodeCollectionSnapshot,
  type SharedSongCollection,
} from "@/lib/song-collection-codec";

type CatalogSong = {
  songIdentifier: string;
  title: string;
  artist: string;
  coverUrl?: string;
};
const downloadURL = "https://github.com/rhythmeta/maimaid/releases/latest";

export function PublicCollectionPage({ segment }: { segment: string }) {
  const { t } = useTranslation("collection");
  const [collection, setCollection] = useState<SharedSongCollection | null>(
    null,
  );
  const [invalid, setInvalid] = useState(false);
  const [catalog, setCatalog] = useState<CatalogSong[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void decodeCollectionSnapshot(segment)
      .then(async (payload) => {
        if (controller.signal.aborted) return;
        setCollection(payload);
        const origin = (
          process.env.NEXT_PUBLIC_MAIMAID_STATIC_URL ??
          "https://maimaid-assets.rhythmeta.org"
        ).replace(/\/+$/u, "");
        try {
          const response = await fetch(`${origin}/community-index.json`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("Catalog unavailable");
          const data = (await response.json()) as { catalog?: CatalogSong[] };
          if (!Array.isArray(data.catalog)) throw new Error("Invalid catalog");
          if (!controller.signal.aborted) setCatalog(data.catalog);
        } catch {
          if (!controller.signal.aborted) setCatalogFailed(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setInvalid(true);
      });
    return () => controller.abort();
  }, [segment]);

  const byId = useMemo(
    () => new Map(catalog.map((song) => [song.songIdentifier, song])),
    [catalog],
  );

  if (invalid || !collection) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {t(invalid ? "invalidTitle" : "loadingTitle")}
            </EmptyTitle>
            <EmptyDescription>
              {t(invalid ? "invalidDescription" : "loadingDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/app-icon.png"
              alt=""
              width={36}
              height={36}
              className="rounded-md"
            />
            <div>
              <p className="font-semibold">maimaid</p>
              <p className="text-xs text-muted-foreground">
                {t("sharedCollection")}
              </p>
            </div>
          </div>
          <Button asChild>
            <a href={`maimaid://collection/${segment}`}>
              <SmartphoneIcon data-icon="inline-start" />
              {t("openInApp")}
            </a>
          </Button>
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
        <section className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t("chartCount", { count: collection.entries.length })}
          </p>
          <h1 className="text-3xl font-bold break-words">
            {collection.name || t("untitled")}
          </h1>
        </section>
        {catalogFailed && (
          <Alert>
            <AlertTitle>{t("catalogFailedTitle")}</AlertTitle>
            <AlertDescription>{t("catalogFailedDescription")}</AlertDescription>
          </Alert>
        )}
        {collection.entries.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("empty")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol className="divide-y border-y" aria-label={t("listLabel")}>
            {collection.entries.map((entry, index) => {
              const song = byId.get(entry.songId);
              return (
                <li
                  key={`${index}:${entry.songId}`}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <span className="w-6 text-center text-sm text-muted-foreground">
                    {index + 1}
                  </span>
                  {song?.coverUrl ? (
                    <Image
                      src={song.coverUrl}
                      alt=""
                      width={56}
                      height={56}
                      unoptimized
                      className="size-14 rounded-md object-cover"
                    />
                  ) : (
                    <Music2Icon
                      className="size-14 p-3 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {song?.title ?? entry.songId}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {song?.artist || t("unavailableSong")}
                    </p>
                  </div>
                  <DifficultyBadge
                    chartType={entry.chartType.toUpperCase()}
                    difficulty={entry.difficulty}
                    label={
                      entry.difficulty.toLowerCase() === "remaster"
                        ? "Re:MASTER"
                        : entry.difficulty.toUpperCase()
                    }
                  />
                </li>
              );
            })}
          </ol>
        )}
        <footer className="flex flex-wrap items-center gap-3">
          <Button variant="outline" asChild>
            <a href={downloadURL} target="_blank" rel="noreferrer">
              <DownloadIcon data-icon="inline-start" />
              {t("download")}
            </a>
          </Button>
          <p className="text-sm text-muted-foreground">
            {t("downloadDescription")}
          </p>
        </footer>
      </main>
    </div>
  );
}
