import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { Terminal, Trash2 } from "lucide-react";
import { AppEvent } from "../api/types";

export const EventLogPanel: React.FC = () => {
  const { eventLog, clearEventLog } = useApp();
  const [isOpen, setIsOpen] = useState(true);

  const getEventBadgeStyle = (type: string) => {
    if (type.startsWith("message.")) return { bg: "var(--accent-green-transparent)", text: "var(--accent-green)" };
    if (type.startsWith("draft.")) return { bg: "var(--accent-blue-transparent)", text: "var(--accent-blue-hover)" };
    if (type.startsWith("download.")) return { bg: "rgba(147, 51, 234, 0.15)", text: "#7c3aed" };
    if (type.startsWith("download_queue.")) return { bg: "rgba(147, 51, 234, 0.15)", text: "#7c3aed" };
    if (type.startsWith("bot.")) return { bg: "rgba(14, 165, 233, 0.12)", text: "#0369a1" };
    if (type === "file.new") return { bg: "rgba(236, 72, 153, 0.15)", text: "#be185d" };
    if (type.includes("failed") || type.includes("error")) return { bg: "var(--accent-red-transparent)", text: "var(--accent-red)" };
    return { bg: "rgba(255,255,255,0.05)", text: "var(--text-secondary)" };
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

  return (
    <div
      style={{
        borderTop: "1px solid var(--border-color)",
        backgroundColor: "#090d16",
        display: "flex",
        flexDirection: "column",
        height: isOpen ? "220px" : "36px",
        transition: "height 0.2s ease-in-out",
        zIndex: 5,
        position: "relative",
      }}
    >
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: "36px",
          padding: "0 16px",
          backgroundColor: "#0d1322",
          borderBottom: isOpen ? "1px solid var(--border-color)" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Terminal size={14} style={{ color: "var(--accent-yellow)" }} />
          <span style={{ fontSize: "0.75rem", fontWeight: "700" }}>WebSocket Event Feed</span>
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          {isOpen ? "Collapse" : "Expand"}
        </div>
      </div>

      {isOpen && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 12px",
              borderBottom: "1px solid var(--border-color)",
              backgroundColor: "rgba(0,0,0,0.1)",
            }}
          >
            <div style={{ fontSize: "0.7rem", fontWeight: "bold", color: "var(--text-muted)" }}>
              Backend events
            </div>
            <button
              onClick={clearEventLog}
              disabled={eventLog.length === 0}
              style={{
                fontSize: "0.65rem",
                color: eventLog.length === 0 ? "var(--text-muted)" : "var(--accent-red)",
                cursor: eventLog.length === 0 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              <Trash2 size={10} />
              <span>Clear Feed</span>
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {eventLog.length === 0 ? (
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", marginTop: "24px" }}>
                No backend events received yet.
              </div>
            ) : (
              eventLog.map((ev, idx) => {
                const badge = getEventBadgeStyle(ev.type);
                return (
                  <div
                    key={`${ev.eventId}-${idx}`}
                    style={{
                      display: "flex",
                      gap: "10px",
                      alignItems: "flex-start",
                      fontSize: "0.7rem",
                      fontFamily: "var(--font-mono)",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.02)",
                      paddingBottom: "4px",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>
                      {new Date(ev.occurredAt).toLocaleTimeString([], { hour12: false })}
                    </span>
                    <span
                      style={{
                        backgroundColor: badge.bg,
                        color: badge.text,
                        padding: "1px 6px",
                        borderRadius: "4px",
                        fontWeight: "bold",
                        fontSize: "0.65rem",
                        minWidth: "120px",
                        textAlign: "center",
                      }}
                    >
                      {ev.type}
                    </span>
                    <span style={{ color: "var(--text-primary)", flex: 1, wordBreak: "break-all" }}>
                      {getEventSummary(ev)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
