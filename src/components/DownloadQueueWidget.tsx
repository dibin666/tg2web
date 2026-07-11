import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { List, X, RefreshCw, Check, SkipForward, Trash2, ChevronDown, ChevronUp, Disc } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Cover: React.FC<{ url?: string; title: string; size: number }> = ({ url, title, size }) =>
  url ? (
    <img
      src={url}
      alt={title}
      className="shrink-0 rounded-lg border object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
      style={{ width: size, height: size }}
    >
      <Disc className="size-1/2" />
    </div>
  );

export const DownloadQueueWidget: React.FC = () => {
  const {
    downloadQueue,
    skipDownloadQueueItem,
    markDownloadQueueItemComplete,
    clearDownloadQueue,
  } = useApp();

  const [expanded, setExpanded] = useState(false);

  const activeItem = downloadQueue.find((item) => item.status === "downloading");
  const queuedItems = downloadQueue.filter((item) => item.status === "queued");
  const completedItemsCount = downloadQueue.filter((item) => item.status === "completed").length;
  const failedItemsCount = downloadQueue.filter((item) => item.status === "failed").length;
  const activeCount = queuedItems.length + (activeItem ? 1 : 0);

  if (downloadQueue.length === 0) {
    return null;
  }

  return (
    <div className="relative inline-block">
      {/* Expanded panel */}
      {expanded && (
        <div className="message-entry glass-panel shadow-float absolute right-0 top-[calc(100%+10px)] z-50 flex max-h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl max-sm:fixed max-sm:inset-x-2 max-sm:top-14 max-sm:w-auto">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <List className="size-4 text-primary" />
              <span className="text-sm font-semibold">下载队列管理</span>
              <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {activeCount}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDownloadQueue}
                className="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                清空队列
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setExpanded(false)}
                className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {/* Active item */}
            {activeItem ? (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                <div className="mb-3 flex gap-3">
                  <Cover url={activeItem.coverUrl} title={activeItem.title} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{activeItem.title}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{activeItem.artist}</div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                      <RefreshCw className="size-3 animate-spin" />
                      <span>正在下载推送任务...</span>
                    </div>
                  </div>
                </div>

                {/* Log console */}
                <div className="scrollbar-thin flex h-20 flex-col gap-1 overflow-y-auto rounded-lg border bg-background/70 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground dark:bg-background/40">
                  {activeItem.logs.length === 0 ? (
                    <span className="opacity-70">等待机器人响应...</span>
                  ) : (
                    activeItem.logs.map((log, index) => (
                      <div key={index} className="break-all">
                        <span className="text-primary">&gt;</span> {log}
                      </div>
                    ))
                  )}
                </div>

                {/* Actions */}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => markDownloadQueueItemComplete(activeItem.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[var(--success-soft)] py-1.5 text-xs font-semibold text-success transition-all hover:brightness-95 active:scale-[0.98]"
                  >
                    <Check className="size-3.5" />
                    标记完成
                  </button>
                  <button
                    type="button"
                    onClick={() => skipDownloadQueueItem(activeItem.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--warning-soft)] py-1.5 text-xs font-semibold text-warning transition-all hover:brightness-95 active:scale-[0.98]"
                  >
                    <SkipForward className="size-3.5" />
                    跳过任务
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
                没有正在下载的任务
              </div>
            )}

            {/* Queue */}
            {queuedItems.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  等候中 ({queuedItems.length})
                </div>
                <div className="scrollbar-thin flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                  {queuedItems.map((item, index) => (
                    <div key={item.id} className="flex items-center gap-2.5 rounded-lg border bg-card/60 p-1.5">
                      <span className="w-4 shrink-0 text-center text-[11px] font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                      <Cover url={item.coverUrl} title={item.title} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{item.title}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{item.artist}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => skipDownloadQueueItem(item.id)}
                        className="size-7 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="取消下载"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer stats */}
            <div className="flex shrink-0 justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
              <span>已完成: {completedItemsCount}</span>
              <span>失败/跳过: {failedItemsCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Trigger chip */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "relative inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-100",
          activeItem
            ? "border-primary/30 bg-primary/10 text-primary"
            : "bg-background/60 text-muted-foreground hover:text-foreground"
        )}
      >
        {activeItem ? <RefreshCw className="size-3 animate-spin" /> : <List className="size-3" />}
        <span className="max-sm:hidden">{activeItem ? `正在下载 (${activeCount})` : `下载队列 (${queuedItems.length})`}</span>
        <span className="sm:hidden">{activeCount}</span>
        {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}

        {queuedItems.length > 0 && !expanded && (
          <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white ring-2 ring-card">
            {activeCount}
          </span>
        )}
      </button>
    </div>
  );
};
