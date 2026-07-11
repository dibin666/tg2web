import React, { useRef, useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { MessageBubble } from "../components/MessageBubble";
import { PendingDraftBubble } from "../components/PendingDraftBubble";
import { MessageComposer } from "../components/MessageComposer";
import { DownloadQueueWidget } from "../components/DownloadQueueWidget";
import { BotAvatar } from "../components/BotAvatar";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const BOT_STATUS_META: Record<string, { label: string; className: string }> = {
  available: { label: "在线", className: "bg-[var(--success-soft)] text-success border-transparent" },
  restricted: { label: "受限", className: "bg-[var(--danger-soft)] text-destructive border-transparent" },
  unknown: { label: "未知", className: "bg-muted text-muted-foreground border-transparent" },
};

export const ChatPage: React.FC = () => {
  const { bots, activeBotId, messages, pendingDrafts, loading } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);

  // Track mount / switch bot time to only animate live new messages.
  const [mountTime, setMountTime] = useState<number>(0);
  useEffect(() => {
    const animId = requestAnimationFrame(() => {
      setMountTime(Date.now());
    });
    return () => cancelAnimationFrame(animId);
  }, [activeBotId]);

  const activeBot = bots.find((b) => b.id === activeBotId);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = containerRef.current;
    if (!container) return;

    const applyScroll = () => {
      container.scrollTo({ top: container.scrollHeight, behavior });
    };

    requestAnimationFrame(() => {
      applyScroll();
      requestAnimationFrame(applyScroll);
      window.setTimeout(applyScroll, 90);
    });
  }, []);

  // Auto scroll on bot switch, new message, media load, or new draft.
  useEffect(() => {
    scrollToBottom("auto");
  }, [activeBotId, messages.length, pendingDrafts.length, scrollToBottom]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="gradient-brand size-9 animate-pulse rounded-2xl" />
          <span className="text-sm">正在加载会话数据...</span>
        </div>
      </div>
    );
  }

  if (!activeBotId || !activeBot) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 bg-background p-6 text-center">
        <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Bot className="size-7 text-muted-foreground/60" />
        </div>
        <h3 className="text-base font-semibold text-foreground">尚未选择会话</h3>
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          从左侧列表选择一个已发布的机器人,即可查看共享 Telegram 会话。
        </p>
      </div>
    );
  }

  const statusMeta = BOT_STATUS_META[activeBot.status] || BOT_STATUS_META.unknown;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Chat header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
        <BotAvatar id={activeBot.id} title={activeBot.title} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-sans text-sm font-semibold tracking-normal">{activeBot.title}</h1>
            <Badge className={cn("h-5 rounded-full px-2 text-[10px] font-semibold", statusMeta.className)}>
              {statusMeta.label}
            </Badge>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            @{activeBot.username || "unknown_bot"}
            <span className="max-sm:hidden">
              {" · "}
              <code className="font-mono text-[11px]">{activeBot.telegramChatId}</code>
            </span>
          </div>
        </div>
        <DownloadQueueWidget />
      </header>

      {/* Message thread on cream canvas */}
      <div
        ref={containerRef}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-background px-4 py-4"
        style={{ overflowAnchor: "none" }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col">
          {messages.length === 0 && pendingDrafts.length === 0 ? (
            <div className="m-auto flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted">
                <Bot className="size-6 text-muted-foreground/50" />
              </div>
              <h4 className="text-sm font-semibold text-foreground">会话的开始</h4>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                当前会话还没有历史消息,新的 Telegram 消息到达后会实时显示在这里。
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                const isNew = mountTime > 0 && new Date(msg.createdAt).getTime() > mountTime - 1000;
                return <MessageBubble key={msg.id} message={msg} isNew={isNew} />;
              })}
              {pendingDrafts.map((draft) => (
                <PendingDraftBubble key={draft.id} draft={draft} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Composer */}
      <MessageComposer key={activeBotId || "none"} />
    </div>
  );
};
