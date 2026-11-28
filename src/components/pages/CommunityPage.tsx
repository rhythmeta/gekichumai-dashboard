import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { RequestFn, Game } from "@/App";
import type {
  CommunityCandidate,
  AdminCandidate,
  AdminDashboardStats,
} from "@/lib/app-types";
import { AliasesPage } from "./AliasesPage";
import { ApprovedAliasesCard } from "@/components/community/ApprovedAliasesCard";
import { fetchAllRows } from "@/lib/fetch-all-rows";
type Song = {
  songIdentifier: string;
  title: string;
  artist: string;
  coverUrl?: string;
};
export function CommunityPage({
  request,
  isAdmin,
  game,
}: {
  request: RequestFn;
  isAdmin: boolean;
  game: Game;
}) {
  return (
    <div className="flex flex-col gap-4">
      <GameCommunity
        key={game}
        game={game}
        request={request}
        isAdmin={isAdmin}
      />
    </div>
  );
}
function GameCommunity({
  game,
  request,
  isAdmin,
}: {
  game: Game;
  request: RequestFn;
  isAdmin: boolean;
}) {
  const [rows, setRows] = useState<CommunityCandidate[]>([]),
    [count, setCount] = useState(0);
  const [adminRows, setAdminRows] = useState<AdminCandidate[]>([]),
    [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [songs, setSongs] = useState<Song[]>([]),
    [drafts, setDrafts] = useState<Record<string, string>>({});
  const base = `${game}/v1`;
  const load = useCallback(async () => {
    const [board, daily] = await Promise.all([
      fetchAllRows<CommunityCandidate>(
        request,
        `${base}/community/candidates:votingBoard`,
      ),
      request<{ count: number }>(`${base}/community/candidates:dailyCount`),
    ]);
    setRows(board);
    setCount(daily.count);
    if (isAdmin) {
      const [candidates, dashboard] = await Promise.all([
        fetchAllRows<AdminCandidate>(request, `${base}/admin/candidates`),
        request<AdminDashboardStats>(`${base}/admin/dashboard`),
      ]);
      setAdminRows(candidates);
      setStats(dashboard);
    }
  }, [request, base, isAdmin]);
  useEffect(() => {
    void load().catch((error) => toast.error(error.message));
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    const origin =
      game === "maimaid"
        ? (process.env.NEXT_PUBLIC_MAIMAID_STATIC_URL ??
          "https://maimaid-assets.rhythmeta.org")
        : (process.env.NEXT_PUBLIC_CHUNITHMD_STATIC_URL ??
          "https://chunithmd-assets.rhythmeta.org");
    void fetch(`${origin}/community-index.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("曲目索引加载失败");
        const data = (await response.json()) as {
          catalog?: Song[];
          songs: Record<string, string[]>;
        };
        setSongs(
          data.catalog ??
            Object.keys(data.songs).map((songIdentifier) => ({
              songIdentifier,
              title: songIdentifier,
              artist: "",
            })),
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) toast.error(error.message);
      });
    return () => controller.abort();
  }, [game]);
  const byId = useMemo(
    () => new Map(songs.map((song) => [song.songIdentifier, song])),
    [songs],
  );
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <>
      <AliasesPage
        isAdmin={isAdmin}
        communityDailyCount={count}
        communityRows={rows}
        adminStats={stats}
        adminCandidates={adminRows}
        candidateVoteCloseDrafts={drafts}
        resolveSongTitle={(id) => byId.get(id)?.title ?? id}
        resolveSongCoverUrl={(id) => byId.get(id)?.coverUrl ?? null}
        onCommunityVote={(id, vote) =>
          run(() =>
            request(`${base}/community/candidates/${id}:vote`, {
              method: "POST",
              body: { vote },
            }),
          )
        }
        onLoadAdminCandidates={() => run(async () => {})}
        onAdminRollCycle={() =>
          run(() => request(`${base}/admin:rollCycle`, { method: "POST" }))
        }
        onCandidateVoteCloseDraftChange={(id, value) =>
          setDrafts((previous) => ({ ...previous, [id]: value }))
        }
        onAdminVoteWindowUpdate={(id) =>
          run(() =>
            request(`${base}/admin/candidates/${id}:updateVoteWindow`, {
              method: "POST",
              body: { voteCloseAt: new Date(drafts[id]).toISOString() },
            }),
          )
        }
        onAdminCandidateStatusUpdate={(id, status) =>
          run(() =>
            request(`${base}/admin/candidates/${id}:setStatus`, {
              method: "POST",
              body: { status },
            }),
          )
        }
      />
      <ApprovedAliasesCard
        request={request}
        game={game}
        resolveSongTitle={(id) => byId.get(id)?.title ?? id}
        resolveSongCoverUrl={(id) => byId.get(id)?.coverUrl ?? null}
      />
    </>
  );
}
