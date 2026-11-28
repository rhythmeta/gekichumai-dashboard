import { type ReactNode, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HandleText } from "@/components/ui/handle-text";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AdminCandidate,
  AdminDashboardStats,
  CommunityCandidate,
} from "@/lib/app-types";
import { useTablePagination } from "@/lib/use-table-pagination";
import { ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

type AliasesPageProps = {
  isAdmin: boolean;
  communityDailyCount: number;
  communityRows: CommunityCandidate[];
  adminStats: AdminDashboardStats | null;
  adminCandidates: AdminCandidate[];
  candidateVoteCloseDrafts: Record<string, string>;
  resolveSongTitle: (songIdentifier: string) => string;
  resolveSongCoverUrl: (songIdentifier: string) => string | null;
  onCommunityVote: (candidateId: string, vote: -1 | 1) => void | Promise<void>;
  onLoadAdminCandidates: () => void | Promise<void>;
  onAdminRollCycle: () => void | Promise<void>;
  onCandidateVoteCloseDraftChange: (candidateId: string, value: string) => void;
  onAdminVoteWindowUpdate: (candidateId: string) => void | Promise<void>;
  onAdminCandidateStatusUpdate: (
    candidateId: string,
    status: "voting" | "approved" | "rejected",
  ) => void | Promise<void>;
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function toDateTimeLocalInputValue(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetMs = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

export function AliasesPage({
  isAdmin,
  communityDailyCount,
  communityRows,
  adminStats,
  adminCandidates,
  candidateVoteCloseDrafts,
  resolveSongTitle,
  resolveSongCoverUrl,
  onCommunityVote,
  onLoadAdminCandidates,
  onAdminRollCycle,
  onCandidateVoteCloseDraftChange,
  onAdminVoteWindowUpdate,
  onAdminCandidateStatusUpdate,
}: AliasesPageProps) {
  const { t } = useTranslation("aliases");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const selectedCandidate = useMemo(
    () =>
      communityRows.find((row) => row.candidateId === selectedCandidateId) ??
      null,
    [communityRows, selectedCandidateId],
  );
  const adminCandidateById = useMemo(
    () => new Map(adminCandidates.map((row) => [row.candidateId, row])),
    [adminCandidates],
  );
  const selectedAdminCandidate = selectedCandidate
    ? adminCandidateById.get(selectedCandidate.candidateId)
    : undefined;
  const communityPagination = useTablePagination(communityRows);

  const handleOpenDetail = (row: CommunityCandidate) => {
    setSelectedCandidateId(row.candidateId);
    if (row.voteCloseAt && !candidateVoteCloseDrafts[row.candidateId]) {
      onCandidateVoteCloseDraftChange(
        row.candidateId,
        toDateTimeLocalInputValue(row.voteCloseAt),
      );
    }
  };

  const submitterHandle =
    selectedAdminCandidate?.submitterHandle ??
    selectedCandidate?.submitterHandle ??
    null;
  const submitterValue: ReactNode = submitterHandle ? (
    <HandleText handle={submitterHandle} />
  ) : (
    "-"
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {t("badgeDailySubmit", { count: communityDailyCount })}
        </Badge>
        <Badge variant="secondary">
          {t("badgeCurrentCandidates", { count: communityRows.length })}
        </Badge>
        {isAdmin ? (
          <Badge>
            {t("badgePendingSettle", {
              count: adminStats?.expiredVotingCount ?? 0,
            })}
          </Badge>
        ) : null}
      </div>

      {isAdmin ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("sectionAdminQuickActions")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              className="h-9 w-full sm:w-auto"
              variant="outline"
              onClick={() => void onLoadAdminCandidates()}
            >
              {t("btnRefreshAdminData")}
            </Button>
            <Button
              className="h-9 w-full sm:w-auto"
              onClick={() => void onAdminRollCycle()}
            >
              {t("btnManualSettle")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("sectionCandidates")}</CardTitle>
        </CardHeader>
        <CardContent>
          {communityRows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t("noCandidatesTitle")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="-mt-1 divide-y divide-border/60 md:hidden">
                {communityPagination.pagedItems.map((row) => (
                  <button
                    key={row.candidateId}
                    type="button"
                    className="w-full py-3 text-left"
                    onClick={() => handleOpenDetail(row)}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="size-12 rounded-md">
                        <AvatarImage
                          src={
                            resolveSongCoverUrl(row.songIdentifier) ?? undefined
                          }
                          alt={resolveSongTitle(row.songIdentifier)}
                        />
                        <AvatarFallback>
                          {resolveSongTitle(row.songIdentifier)
                            .slice(0, 1)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {resolveSongTitle(row.songIdentifier)}
                        </p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {t("aliasPrefix")}
                          {row.aliasText}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {t("supportCountPrefix", {
                              count: row.supportCount,
                            })}
                          </span>
                          <span>
                            {t("opposeCountPrefix", { count: row.opposeCount })}
                          </span>
                          <span>
                            {t("closeAtPrefix")}
                            {formatDateTime(row.voteCloseAt)}
                          </span>
                        </div>
                      </div>
                      <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    </div>
                    <span className="sr-only">{t("btnViewDetails")}</span>
                  </button>
                ))}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colSong")}</TableHead>
                      <TableHead>{t("colAlias")}</TableHead>
                      <TableHead>{t("colSupport")}</TableHead>
                      <TableHead>{t("colOppose")}</TableHead>
                      <TableHead>{t("colCloseAt")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {communityPagination.pagedItems.map((row) => (
                      <TableRow
                        key={row.candidateId}
                        className="cursor-pointer"
                        onClick={() => handleOpenDetail(row)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-11 rounded-md">
                              <AvatarImage
                                src={
                                  resolveSongCoverUrl(row.songIdentifier) ??
                                  undefined
                                }
                                alt={resolveSongTitle(row.songIdentifier)}
                              />
                              <AvatarFallback>
                                {resolveSongTitle(row.songIdentifier)
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="max-w-[280px] truncate">
                              {resolveSongTitle(row.songIdentifier)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate">
                          {row.aliasText}
                        </TableCell>
                        <TableCell>{row.supportCount}</TableCell>
                        <TableCell>{row.opposeCount}</TableCell>
                        <TableCell>{formatDateTime(row.voteCloseAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <TablePagination
                page={communityPagination.page}
                pageCount={communityPagination.pageCount}
                pageSize={communityPagination.pageSize}
                onPageChange={communityPagination.setPage}
                onPageSizeChange={communityPagination.setPageSize}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedCandidate)}
        onOpenChange={(open) => !open && setSelectedCandidateId(null)}
      >
        <DialogContent className="max-h-[calc(100dvh-1.5rem)] gap-3 overflow-y-auto sm:!max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDesc")}</DialogDescription>
          </DialogHeader>

          {selectedCandidate ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Avatar className="size-20 rounded-md sm:size-24">
                  <AvatarImage
                    src={
                      resolveSongCoverUrl(selectedCandidate.songIdentifier) ??
                      undefined
                    }
                    alt={resolveSongTitle(selectedCandidate.songIdentifier)}
                  />
                  <AvatarFallback>
                    {resolveSongTitle(selectedCandidate.songIdentifier)
                      .slice(0, 1)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-1 flex-col gap-2">
                  <p className="text-base font-medium">
                    {resolveSongTitle(selectedCandidate.songIdentifier)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("aliasPrefix")}
                    {selectedCandidate.aliasText}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {t("statusPrefix")}
                      {selectedAdminCandidate?.status ??
                        selectedCandidate.status ??
                        "voting"}
                    </Badge>
                    <Badge variant="secondary">
                      {t("supportCountPrefix", {
                        count: selectedCandidate.supportCount,
                      })}
                    </Badge>
                    <Badge variant="secondary">
                      {t("opposeCountPrefix", {
                        count: selectedCandidate.opposeCount,
                      })}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <InfoBlock label={t("infoSubmitter")} value={submitterValue} />
                <InfoBlock
                  label={t("infoSubmitTime")}
                  value={formatDateTime(
                    selectedAdminCandidate?.createdAt ??
                      selectedCandidate.createdAt ??
                      null,
                  )}
                />
                <InfoBlock
                  label={t("infoCloseTime")}
                  value={formatDateTime(
                    selectedAdminCandidate?.voteCloseAt ??
                      selectedCandidate.voteCloseAt,
                  )}
                />
                <InfoBlock
                  label={t("infoVoteStart")}
                  value={formatDateTime(selectedCandidate.voteOpenAt)}
                />
                <InfoBlock
                  label={t("infoMyVote")}
                  value={
                    selectedCandidate.myVote === 1
                      ? t("voteSupport")
                      : selectedCandidate.myVote === -1
                        ? t("voteOppose")
                        : t("voteNone")
                  }
                />
                <InfoBlock
                  label={t("infoCandidateId")}
                  value={selectedCandidate.candidateId}
                />
              </div>
              <InfoBlock
                label={t("infoAlias")}
                value={selectedCandidate.aliasText}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  className="h-8 flex-1 sm:flex-none"
                  variant={
                    selectedCandidate.myVote === 1 ? "default" : "outline"
                  }
                  onClick={() =>
                    void onCommunityVote(selectedCandidate.candidateId, 1)
                  }
                >
                  {selectedCandidate.myVote === 1
                    ? t("btnCancelSupport")
                    : t("btnSupport")}
                </Button>
                <Button
                  className="h-8 flex-1 sm:flex-none"
                  variant={
                    selectedCandidate.myVote === -1 ? "default" : "outline"
                  }
                  onClick={() =>
                    void onCommunityVote(selectedCandidate.candidateId, -1)
                  }
                >
                  {selectedCandidate.myVote === -1
                    ? t("btnCancelOppose")
                    : t("btnOppose")}
                </Button>
              </div>

              {isAdmin ? (
                <>
                  <Separator />
                  <div className="text-sm font-medium">
                    {t("sectionAdminActions")}
                  </div>
                  <FieldGroup className="gap-2">
                    <Field>
                      <FieldLabel htmlFor="candidate-vote-close">
                        {t("labelVoteCloseTime")}
                      </FieldLabel>
                      <Input
                        id="candidate-vote-close"
                        type="datetime-local"
                        value={
                          candidateVoteCloseDrafts[
                            selectedCandidate.candidateId
                          ] ?? ""
                        }
                        onChange={(event) =>
                          onCandidateVoteCloseDraftChange(
                            selectedCandidate.candidateId,
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                  </FieldGroup>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="h-8 w-full sm:w-auto"
                      variant="outline"
                      onClick={() =>
                        void onAdminVoteWindowUpdate(
                          selectedCandidate.candidateId,
                        )
                      }
                    >
                      {t("btnUpdateCloseTime")}
                    </Button>
                    <Button
                      className="h-8 w-full sm:w-auto"
                      variant="outline"
                      onClick={() =>
                        void onAdminCandidateStatusUpdate(
                          selectedCandidate.candidateId,
                          "voting",
                        )
                      }
                    >
                      {t("btnSetVoting")}
                    </Button>
                    <Button
                      className="h-8 w-full sm:w-auto"
                      variant="outline"
                      onClick={() =>
                        void onAdminCandidateStatusUpdate(
                          selectedCandidate.candidateId,
                          "approved",
                        )
                      }
                    >
                      {t("btnSetApproved")}
                    </Button>
                    <Button
                      className="h-8 w-full sm:w-auto"
                      variant="outline"
                      onClick={() =>
                        void onAdminCandidateStatusUpdate(
                          selectedCandidate.candidateId,
                          "rejected",
                        )
                      }
                    >
                      {t("btnSetRejected")}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedCandidateId(null)}
            >
              {t("btnClose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-all text-[13px] leading-5">{value}</p>
    </div>
  );
}
