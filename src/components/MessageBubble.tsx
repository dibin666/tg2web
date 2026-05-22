import React from "react";
import { ChatMessage } from "../api/types";
import { EntityTextRenderer } from "./EntityTextRenderer";
import { MediaPreview } from "./MediaPreview";
import { InlineKeyboardPreview } from "./InlineKeyboardPreview";
import { Check, CheckCheck, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import { useApp } from "../context/AppContext";

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const { userRole, t } = useApp();

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  if (message.direction === "system" || message.status === "deleted") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          margin: "12px 0",
          width: "100%",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--bubble-system)",
            border: "1px solid var(--border-color)",
            borderRadius: "6px",
            padding: "6px 16px",
            fontSize: "0.75rem",
            color: message.status === "deleted" ? "var(--accent-red)" : "var(--text-secondary)",
            maxWidth: "80%",
            textAlign: "center",
          }}
        >
          {message.status === "deleted" ? "[Message Deleted]" : message.text}
          {message.createdAt && (
            <span style={{ marginLeft: "8px", opacity: 0.6 }}>
              {formatTime(message.createdAt)}
            </span>
          )}
        </div>
      </div>
    );
  }

  const isOutgoing = message.direction === "outgoing";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isOutgoing ? "flex-end" : "flex-start",
        margin: "8px 0",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: isOutgoing ? "flex-end" : "flex-start",
          maxWidth: "75%",
          minWidth: "150px",
        }}
      >
        {/* Attribution / Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "0.7rem",
            color: "var(--text-secondary)",
            marginBottom: "3px",
            padding: "0 4px",
          }}
        >
          {isOutgoing ? (
            <>
              {userRole === "admin" && message.sentByInternalUser && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    color: "var(--accent-blue-hover)",
                    fontWeight: "500",
                  }}
                >
                  <ShieldCheck size={10} />
                  {message.sentByInternalUser.id === "user_key"
                    ? `${t("sentViaKey")} ${message.sentByInternalUser.displayName}`
                    : `${message.sentByInternalUser.displayName}`}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>
              Telegram Bot
              {userRole === "admin" && message.sentByInternalUser ? ` · for ${message.sentByInternalUser.displayName}` : ""}
            </span>
          )}
        </div>

        {/* Bubble Body */}
        <div
          style={{
            backgroundColor: isOutgoing ? "var(--bubble-outgoing)" : "var(--bubble-incoming)",
            borderRadius: isOutgoing ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
            padding: "8px 12px",
            position: "relative",
            width: "100%",
            boxShadow: "var(--shadow-sm)",
            borderLeft: message.status === "failed" ? "3px solid var(--accent-red)" : undefined,
          }}
        >
          {/* Main Text */}
          {message.text && (
            <div
              style={{
                fontSize: "0.9rem",
                lineHeight: "1.4",
                color: message.status === "failed" ? "rgba(255,255,255,0.7)" : (isOutgoing ? "var(--bubble-outgoing-text)" : "var(--bubble-incoming-text)"),
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              <EntityTextRenderer text={message.text} entities={message.entities} />
            </div>
          )}

          {/* Media Attachments */}
          {message.media && message.media.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: message.text ? "8px" : "0" }}>
              {message.media.map((med, idx) => (
                <MediaPreview key={idx} media={med} messageId={message.id} />
              ))}
            </div>
          )}

          {/* Inline Keyboard Preview */}
          {message.inlineKeyboard && (
            <InlineKeyboardPreview botId={message.botId} messageId={message.id} keyboard={message.inlineKeyboard} />
          )}

          {/* Status & Time Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "4px",
              marginTop: "4px",
              fontSize: "0.65rem",
              color: isOutgoing ? "rgba(255, 255, 255, 0.7)" : "var(--text-muted)",
            }}
          >
            {message.editedAt && <span>edited</span>}
            <span>{formatTime(message.createdAt)}</span>
            {isOutgoing && (
              <span style={{ display: "inline-flex" }}>
                {message.status === "pending" && <Clock size={10} className="animate-pulse-slow" />}
                {message.status === "sent" && <Check size={10} />}
                {(message.status === "received" || message.status === "edited") && <CheckCheck size={10} style={{ color: "var(--accent-blue-hover)" }} />}
                {message.status === "failed" && (
                  <span style={{ color: "var(--accent-red)", display: "flex", alignItems: "center", gap: "2px" }}>
                    <AlertTriangle size={10} />
                    <span>Failed</span>
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
