"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CheckCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Game, RequestFn } from "@/App";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { TablePagination } from "@/components/ui/table-pagination";
import type {
  ApprovedAliasRow,
  ApprovedAliasesResponse,
} from "@/lib/app-types";
import { normalizeSearchText } from "@/lib/app-helpers";
import { useTablePagination } from "@/lib/use-table-pagination";
import { cn } from "@/lib/utils";

/** Per-game in-memory cache: the public sync endpoint allows 120 requests/min/IP. */
const approvedAliasesCache = new Map<Game, ApprovedAliasRow[]>();
const approvedAliasesInFlight = new Map<Game, Promise<ApprovedAliasRow[]>>();

function formatApprovedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function compareApprovedAt(left: ApprovedAliasRow, right: ApprovedAliasRow) {
  const leftTime = left.approvedAt ? Date.parse(left.approvedAt) : NaN;
  const rightTime = right.approvedAt ? Date.parse(right.approvedAt) : NaN;
  const leftHasDate = !Number.isNaN(leftTime);
  const rightHasDate = !Number.isNaN(rightTime);
  if (!leftHasDate && !rightHasDate) return 0;
  if (!leftHasDate) return 1;
  if (!rightHasDate) return -1;
  return rightTime - leftTime;
}

function SkeletonRow() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="h-3 w-28 animate-pulse rounded bg-muted" />
    </div>
  );
}

export function ApprovedAliasesCard({
  request,
  game,
  resolveSongTitle,
  resolveSongCoverUrl,
}: {
  request: RequestFn;
  game: Game;
  resolveSongTitle: (songIdentifier: string) => string;
  resolveSongCoverUrl: (songIdentifier: string) => string | null;
}) {
  const { t } = useTranslation("aliases");
  const [rows, setRows] = useState<ApprovedAliasRow[] | null>(
    () => approvedAliasesCache.get(game) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(
    async (force = false) => {
      const cached = approvedAliasesCache.get(game);
      if (cached && !force) {
        setRows(cached);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        let pending = approvedAliasesInFlight.get(game);
        if (!pending) {
          const requestPromise = request<ApprovedAliasesResponse>(
            `${game}/v1/community/aliases:sync`,
            { auth: false },
          )
            .then((payload) => {
              const next = Array.isArray(payload?.rows) ? payload.rows : [];
              approvedAliasesCache.set(game, next);
              return next;
            })
            .finally(() => {
              approvedAliasesInFlight.delete(game);
            });
          approvedAliasesInFlight.set(game, requestPromise);
          pending = requestPromise;
        }
        const next = await pending;
        setRows(next);
      } catch (loadError) {
        const message = (loadError as Error).message;
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [game, request],
  );

  useEffect(() => {
    if (approvedAliasesCache.has(game)) {
      setRows(approvedAliasesCache.get(game) ?? []);
      return;
    }
    void load().catch(() => {
      // `load` already surfaced the error.
    });
  }, [game, load]);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const orderedRows = [...rows].sort(compareApprovedAt);
    const query = normalizeSearchText(search.trim());
    if (!query) return orderedRows;
    return orderedRows.filter((row) => {
      const songTitle = resolveSongTitle(row.songIdentifier);
      return normalizeSearchText(
        `${row.aliasText} ${row.songIdentifier} ${songTitle}`,
      ).includes(query);
    });
  }, [rows, search, resolveSongTitle]);

  const { page, pageCount, pageSize, pagedItems, setPage, setPageSize } =
    useTablePagination(filteredRows, { initialPageSize: 20 });

  useEffect(() => {
    setPage(1);
  }, [search, setPage]);

  const totalCount = rows?.length ?? 0;
  const filteredCount = filteredRows.length;
  const searching = normalizeSearchText(search.trim()).length > 0;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("approvedTitle")}</CardTitle>
        <CardDescription>{t("approvedDesc")}</CardDescription>
        <CardAction>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void load(true)}
          >
            <RefreshCwIcon
              data-icon="inline-start"
              className={cn(loading && "animate-spin")}
            />
            {t("approvedRefresh")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              placeholder={t("approvedSearchPlaceholder")}
              aria-label={t("approvedSearchLabel")}
              className="pl-8"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {rows && !loading ? (
            <p className="text-xs text-muted-foreground">
              {searching
                ? t("approvedFilteredTotal", {
                    matched: filteredCount,
                    total: totalCount,
                  })
                : t("approvedTotal", { total: totalCount })}
            </p>
          ) : null}
        </div>

        {loading && rows === null ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : error ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{t("approvedLoadFailed")}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span>{error}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={loading}
                onClick={() => void load(true)}
              >
                <RefreshCwIcon data-icon="inline-start" />
                {t("approvedRetry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : filteredRows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {searching ? <SearchIcon /> : <CheckCircleIcon />}
              </EmptyMedia>
              <EmptyTitle>
                {searching
                  ? t("approvedNoMatchTitle")
                  : t("approvedEmptyTitle")}
              </EmptyTitle>
              <EmptyDescription>
                {searching ? t("approvedNoMatchDesc") : t("approvedEmptyDesc")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-border/60">
              {pagedItems.map((row) => {
                const title = resolveSongTitle(row.songIdentifier);
                const approvedAt = formatApprovedAt(row.approvedAt);
                return (
                  <li
                    key={row.candidateId}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <Avatar className="size-10 shrink-0 rounded-md ring-1 ring-foreground/10">
                      <AvatarImage
                        src={
                          resolveSongCoverUrl(row.songIdentifier) ?? undefined
                        }
                        alt={title || row.songIdentifier}
                      />
                      <AvatarFallback>
                        {(title || row.songIdentifier)
                          .slice(0, 1)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {row.aliasText}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {title && title !== row.songIdentifier
                          ? `${title} · ${row.songIdentifier}`
                          : row.songIdentifier}
                      </p>
                    </div>
                    {approvedAt ? (
                      <p className="shrink-0 text-right text-xs text-muted-foreground">
                        {t("approvedAt", { time: approvedAt })}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {filteredCount > 20 ? (
              <TablePagination
                page={page}
                pageCount={pageCount}
                pageSize={pageSize}
                pageSizeOptions={[20, 50]}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
