import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { Terminal, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { AppEvent } from "../api/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const badgeToneFor = (type: string) => {
  if (type.includes("failed") || type.includes("error")) return "bg-[var(--danger-soft)] text-destructive";
  if (type.startsWith("message.")) return "bg-[var(--success-soft)] text-success";
  if (type.startsWith("draft.")) return "bg-primary/10 text-primary";
  if (type.startsWith("download")) return "bg-[var(--info-soft)] text-info";
  if (type.startsWith("bot.")) return "bg-[var(--warning-soft)] text-warning";
  if (type === "file.new") return "bg-primary/10 text-primary";
  return "bg-muted text-muted-foreground";
};

const getEventSummary = (ev: AppEvent) => {
  switch (ev.type) {
    case "connection.status":
      return `TDLib connection state: ${ev.status}`;
    case "telegram.auth_state":
      return `Telegram authorization: ${ev.authState}, TDLib: ${ev.tdlibState}`;
    case "bot.published":
      return `Bot published: ${ev.bot.title}`;
    case "bot.updated":
      return `Bot updated: ${ev.bot.title}`;
    case "bot.unpublished":
      return `Bot unpublished: ${ev.botId}`;
    case "message.new":
      return `New message [${ev.message.id}] direction=${ev.message.direction} status=${ev.message.status}`;
    case "message.edited":
      return `Message edited [${ev.message.id}] text preview: "${ev.message.text?.substring(0, 20)}..."`;
    case "message.deleted":
      return `Message deleted: [${ev.messageId}]`;
    case "message.send_ack":
      return `Message ACK: Request ID [${ev.clientRequestId}] assigned Telegram Message ID [${ev.messageId}]`;
    case "message.send_failed":
      return `Message SEND FAILED: Request ID [${ev.clientRequestId}] Error: ${ev.error}`;
    case "draft.pending":
      return `Draft pending [${ev.draft.draftId}]: "${ev.draft.text.substring(0, 25)}..."`;
    case "draft.expired":
      return `Draft expired/cancelled: [${ev.draftId}]`;
    case "draft.finalized":
      return `Draft finalized: [${ev.draftId}] -> permanent message ID [${ev.finalMessageId}]`;
    case "download.progress": {
      const pct = ev.download.sizeBytes ? Math.round((ev.download.downloadedBytes / ev.download.sizeBytes) * 100) : 0;
      return `Download progress [${ev.download.id}]: ${pct}% (${ev.download.downloadedBytes} B)`;
    }
    case "download.ready":
      return `Download ready [${ev.download.id}]: ${ev.download.proxyUrl || ev.download.fileId}`;
    case "download.failed":
      return `Download failed [${ev.download.id}]: ${ev.download.error || "connection failure"}`;
    case "download_queue.item_updated":
      return `Queue item ${ev.item.status}: ${ev.item.title}`;
    case "download_queue.cleared":
      return "Download queue cleared";
    case "file.new":
      return `New workspace file [${ev.file.id}]: "${ev.file.fileName}" (${ev.file.mimeType}) sender=${ev.file.senderName}`;
    case "telegram.error":
      return `Telegram error code [${ev.code}]: ${ev.message}`;
    default:
      return JSON.stringify(ev);
  }
};

export const EventLogPanel: React.FC = () => {
  const { eventLog, clearEventLog } = useApp();
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col overflow-hidden rounded-2xl border bg-card transition-[height] duration-200 max-md:rounded-none max-md:border-x-0 max-md:border-b-0",
        isOpen ? "h-56" : "h-10"
      )}
    >
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-10 shrink-0 select-none items-center justify-between px-4 transition-colors hover:bg-accent/40",
          isOpen && "border-b"
        )}
      >
        <div className="flex items-center gap-2">
          <Terminal className="size-3.5 text-warning" />
          <span className="text-xs font-semibold">WebSocket 事件流</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
            {eventLog.length}
          </span>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {isOpen ? "收起" : "展开"}
          {isOpen ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
        </span>
      </button>

      {isOpen && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b bg-background/40 px-4 py-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground">后端事件</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearEventLog}
              disabled={eventLog.length === 0}
              className="h-6 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3" />
              清空
            </Button>
          </div>

          <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2.5">
            {eventLog.length === 0 ? (
              <div className="mt-8 text-center text-xs italic text-muted-foreground">还没有收到后端事件。</div>
            ) : (
              eventLog.map((ev, idx) => (
                <div
                  key={`${ev.eventId}-${idx}`}
                  className="flex items-start gap-2.5 border-b border-border/40 pb-1 font-mono text-[11px] leading-relaxed"
                >
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(ev.occurredAt).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span
                    className={cn(
                      "min-w-32 shrink-0 rounded-md px-1.5 py-px text-center text-[10px] font-bold",
                      badgeToneFor(ev.type)
                    )}
                  >
                    {ev.type}
                  </span>
                  <span className="min-w-0 flex-1 break-all text-foreground/90">{getEventSummary(ev)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
