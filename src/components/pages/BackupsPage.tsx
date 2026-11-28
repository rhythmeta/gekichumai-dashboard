import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { RequestFn, Game } from "@/App";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
type Backup = {
  id: string;
  deviceName: string;
  clientVersion: string;
  profileCount: number;
  size: number;
  committedAt: string;
  downloadUrl: string;
};
export function BackupsPage({
  request,
  game,
}: {
  request: RequestFn;
  game: Game;
}) {
  return (
    <div className="flex flex-col gap-4">
      <GameBackups key={game} game={game} request={request} />
    </div>
  );
}
function GameBackups({ game, request }: { game: Game; request: RequestFn }) {
  const [backups, setBackups] = useState<Backup[]>([]),
    [loading, setLoading] = useState(true),
    [target, setTarget] = useState<Backup | null>(null),
    [deleting, setDeleting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await request<{ backups: Backup[] }>(`${game}/v1/backups`);
      setBackups(result.backups);
    } finally {
      setLoading(false);
    }
  }, [game, request]);
  useEffect(() => {
    void load().catch((error) => toast.error(error.message));
  }, [load]);
  const remove = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await request(`${game}/v1/backups/${target.id}`, { method: "DELETE" });
      setTarget(null);
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDeleting(false);
    }
  };
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>云备份</CardTitle>
          <CardDescription>
            在应用内备份或恢复完整个人数据。每个游戏保留最近 3
            份备份。下载链接可被持有者访问，请勿分享。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button
            variant="outline"
            className="self-start"
            disabled={loading}
            onClick={() =>
              void load().catch((error) => toast.error(error.message))
            }
          >
            刷新
          </Button>
          {!backups.length && (
            <p className="text-sm text-muted-foreground">
              {loading ? "正在加载…" : "尚无备份。请在应用中创建第一份备份。"}
            </p>
          )}
          {backups.map((backup) => (
            <div
              key={backup.id}
              className="flex flex-wrap items-center justify-between gap-4 border-t pt-4"
            >
              <div>
                <p className="font-medium">
                  {new Date(backup.committedAt).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">
                  {backup.deviceName} · {backup.profileCount} 个档案 ·{" "}
                  {(backup.size / 1024 / 1024).toFixed(2)} MiB ·{" "}
                  {backup.clientVersion}
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <a
                    href={backup.downloadUrl}
                    download
                    rel="noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    下载
                  </a>
                </Button>
                <Button variant="destructive" onClick={() => setTarget(backup)}>
                  删除
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除这份云备份？</DialogTitle>
            <DialogDescription>
              云端文件将被删除，应用中的本地数据不受影响。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setTarget(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void remove()}
            >
              删除备份
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
