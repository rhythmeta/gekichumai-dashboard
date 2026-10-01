import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { RequestFn, Game } from "@/App";
import type {
  CommunityCandidate,
  AdminCandidate,
  AdminDashboardStats,
} from "@/lib/app-types";
import { AliasesPage } from "./AliasesPage";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { GameSelect } from "./GameSelect";
type Song = {
  songIdentifier: string;
  title: string;
  artist: string;
  coverUrl?: string;
};
export function CommunityPage({
  request,
  isAdmin,
}: {
  request: RequestFn;
  isAdmin: boolean;
}) {
  const [game, setGame] = useState<Game>("maimaid");
  return (
    <div className="flex flex-col gap-4">
      <GameSelect game={game} onChange={setGame} />
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
  const [songName, setSongName] = useState(""),
    [alias, setAlias] = useState("");
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
  const suggestions = useMemo(
    () =>
      songs
        .filter((song) =>
          `${song.title} ${song.songIdentifier}`
            .toLowerCase()
            .includes(songName.toLowerCase()),
        )
        .slice(0, 20),
    [songs, songName],
  );
  return (
    <AliasesPage
      isAdmin={isAdmin}
      communityDailyCount={count}
      communityRows={rows}
      communitySongName={songName}
      communitySongSuggestions={suggestions}
      communityAliasText={alias}
      adminStats={stats}
      adminCandidates={adminRows}
      candidateVoteCloseDrafts={drafts}
      resolveSongTitle={(id) => byId.get(id)?.title ?? id}
      resolveSongCoverUrl={(id) => byId.get(id)?.coverUrl ?? null}
      onCommunitySongNameChange={setSongName}
      onCommunityAliasTextChange={setAlias}
      onCommunitySubmit={() =>
        run(async () => {
          const song = songs.find(
            (row) => row.songIdentifier === songName || row.title === songName,
          );
          if (!song) throw new Error("请选择有效曲目");
          const result = await request<{ status: string; message?: string }>(
            `${base}/community/candidates`,
            {
              method: "POST",
              body: { songIdentifier: song.songIdentifier, aliasText: alias },
            },
          );
          if (
            result.status === "rejected_duplicate" ||
            result.status === "quota_exceeded"
          )
            throw new Error(result.message ?? "无法提交别名");
          setAlias("");
          toast.success("别名已提交");
        })
      }
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
  );
}
