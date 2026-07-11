import React from "react";
import { adminApiClient, apiClient, downloadProxyFile } from "../api/client";
import { DownloadCacheItem, DownloadCacheSummary } from "../api/types";
import { useApp } from "../context/AppContext";
import { PageHeader } from "../components/PageHeader";
import { Download, HardDriveDownload, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const formatBytes = (bytes?: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const statusBadge = (item: DownloadCacheItem) => {
  let label = "未缓存";
  let cls = "bg-muted text-muted-foreground";

  if (item.serverFileExists) {
    label = "服务器已缓存";
    cls = "bg-[var(--success-soft)] text-success";
  } else if (item.status === "downloading" || item.status === "queued") {
    label = "正在下载到服务器";
    cls = "bg-primary/10 text-primary";
  } else if (item.status === "paused") {
    label = "已暂停";
    cls = "bg-[var(--warning-soft)] text-warning";
  } else if (item.status === "failed") {
    label = "下载失败";
    cls = "bg-[var(--danger-soft)] text-destructive";
  } else if (item.status === "expired") {
    label = "服务器缓存已清理";
    cls = "bg-muted text-muted-foreground";
  }

  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold", cls)}>
      {label}
    </span>
  );
};

const CLEANUP_OPTIONS = [
  { value: 0, label: "关闭" },
  { value: 6, label: "每 6 小时" },
  { value: 12, label: "每 12 小时" },
  { value: 24, label: "每天" },
  { value: 72, label: "每 3 天" },
  { value: 168, label: "每 7 天" },
];

export const CachePage: React.FC = () => {
  const { bots, updateSettings } = useApp();
  const [summary, setSummary] = React.useState<DownloadCacheSummary | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [cleanupInterval, setCleanupInterval] = React.useState(0);

  const loadCache = React.useCallback(async () => {
    const next = await adminApiClient.getDownloadCache();
    setSummary(next);
    setCleanupInterval(next.cleanupIntervalHours);
  }, []);

  React.useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadCache().catch((error) => {
        if (active) setNotice(error instanceof Error ? error.message : String(error));
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadCache]);

  const runAction = async (key: string, action: () => Promise<void>, successMessage: string) => {
    try {
      setBusyKey(key);
      setNotice(null);
      await action();
      await loadCache();
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  };

  const handleClearAll = () => {
    const confirmed = window.confirm("确认删除服务器上的所有本地下载缓存和下载记录?消息和文件历史会保留。");
    if (!confirmed) return;
    void runAction("all", async () => {
      await adminApiClient.clearDownloadCache();
    }, "已清理所有本地下载缓存和下载记录。");
  };

  const handleClearFile = (item: DownloadCacheItem) => {
    void runAction(`clear:${item.fileId}`, async () => {
      await adminApiClient.clearDownloadCacheFile(item.fileId);
    }, "已清理该文件的服务器缓存和下载记录。");
  };

  const handleRefetch = (item: DownloadCacheItem) => {
    void runAction(`fetch:${item.id}`, async () => {
      await apiClient.triggerDownload(item.fileId, item.messageId, item.fileName, item.sizeBytes);
    }, "已提交重新下载任务。");
  };

  const handleBrowserDownload = (item: DownloadCacheItem) => {
    if (!item.proxyUrl) return;
    void runAction(`browser:${item.id}`, async () => {
      await downloadProxyFile(item.proxyUrl!, item.fileName);
    }, "浏览器下载已触发。");
  };

  const handleCleanupIntervalSave = () => {
    void runAction("interval", async () => {
      await updateSettings({ cacheCleanupIntervalHours: cleanupInterval });
    }, "缓存定时清理设置已保存。");
  };

  const botTitle = (botId?: string) => bots.find((bot) => bot.id === botId)?.title || botId || "-";
  const items = summary?.items || [];

  return (
    <div className="scrollbar-thin h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-6 max-sm:p-4">
        <PageHeader
          icon={<HardDriveDownload className="size-5" />}
          title="本地下载缓存"
          description="服务器代理缓存与文件历史状态。"
          actions={
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void loadCache()} disabled={busyKey !== null}>
              <RefreshCw className={cn("size-3.5", busyKey !== null && "animate-spin")} />
              刷新
            </Button>
          }
        />

        {notice && (
          <div className="rounded-xl border bg-card px-4 py-2.5 text-xs text-muted-foreground">{notice}</div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <section className="rounded-2xl border bg-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">缓存占用</div>
            <div className="mt-2 flex items-baseline gap-2">
              <strong className="font-serif text-2xl">{formatBytes(summary?.totalCachedBytes)}</strong>
              <span className="text-xs text-muted-foreground">{summary?.totalCachedFiles || 0} 个服务器缓存文件</span>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">定时清理</div>
            <div className="mt-2 flex items-center gap-2">
              <Select value={String(cleanupInterval)} onValueChange={(v) => setCleanupInterval(Number(v))}>
                <SelectTrigger className="h-9 flex-1 rounded-xl text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLEANUP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-xl"
                onClick={handleCleanupIntervalSave}
                disabled={busyKey === "interval"}
              >
                保存
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">清理操作</div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-9 w-full rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleClearAll}
              disabled={busyKey === "all"}
            >
              <Trash2 className="size-3.5" />
              一键清理缓存和下载记录
            </Button>
          </section>
        </div>

        {/* Detail table */}
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
            <strong className="text-xs font-bold tracking-wide">缓存文件明细</strong>
            <span className="text-[11px] text-muted-foreground">{items.length} 条记录</span>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-14 text-center text-sm text-muted-foreground">还没有文件记录。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-bold">文件</th>
                    <th className="px-4 py-2.5 font-bold">机器人</th>
                    <th className="px-4 py-2.5 font-bold">状态</th>
                    <th className="px-4 py-2.5 font-bold">服务器缓存</th>
                    <th className="px-4 py-2.5 font-bold">原始大小</th>
                    <th className="px-4 py-2.5 font-bold">更新时间</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={`${item.id}:${item.fileId}`} className="border-b transition-colors last:border-b-0 hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <strong className="max-w-52 truncate text-xs font-semibold" title={item.fileName || item.fileId}>
                            {item.fileName || item.fileId}
                          </strong>
                          <span className="text-[11px] text-muted-foreground">
                            {item.mimeType || "application/octet-stream"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">{botTitle(item.botId)}</td>
                      <td className="px-4 py-3">{statusBadge(item)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {item.serverFileExists ? formatBytes(item.cachedBytes) : "不存在"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatBytes(item.sizeBytes)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(item.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {item.serverFileExists ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 rounded-lg px-2.5 text-[11px] text-success hover:bg-[var(--success-soft)] hover:text-success"
                              onClick={() => handleBrowserDownload(item)}
                              disabled={busyKey === `browser:${item.id}`}
                              title="下载到本机"
                            >
                              <Download className="size-3" />
                              下载到本机
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 rounded-lg px-2.5 text-[11px] text-primary hover:bg-primary/10 hover:text-primary"
                              onClick={() => handleRefetch(item)}
                              disabled={busyKey === `fetch:${item.id}`}
                              title="重新下载到服务器"
                            >
                              <RotateCcw className="size-3" />
                              下载到服务器
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-lg px-2.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleClearFile(item)}
                            disabled={(!item.serverFileExists && !item.downloadId) || busyKey === `clear:${item.fileId}`}
                            title="清理该文件缓存和下载记录"
                          >
                            <Trash2 className="size-3" />
                            清理缓存
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
