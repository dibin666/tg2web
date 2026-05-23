import React from "react";
import { ChatMessage, TelegramEntity } from "../api/types";
import { EntityTextRenderer } from "./EntityTextRenderer";
import { MediaPreview } from "./MediaPreview";
import { InlineKeyboardPreview } from "./InlineKeyboardPreview";
import { Check, CheckCheck, Clock, AlertTriangle, ShieldCheck, Trash2 } from "lucide-react";
import { useApp } from "../context/AppContext";

interface MetadataItem {
  key: string;
  value: string;
}

type TextChunk =
  | { type: "text"; content: string; startIndex: number }
  | { type: "metadata"; items: MetadataItem[] };

const isMetadataLine = (line: string): MetadataItem | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const colonIdx = trimmed.indexOf(" : ");
  if (colonIdx === -1) return null;

  const key = trimmed.slice(0, colonIdx).trim();
  const value = trimmed.slice(colonIdx + 3).trim();

  // Key validation: uppercase letters, numbers, spaces, underscores, dashes, slashes, brackets
  if (/^[A-Z0-9\s/_()[\]-]+$/.test(key) && key.length > 0 && key.length <= 30) {
    return { key, value };
  }
  return null;
};

const parseMessageChunks = (text: string): TextChunk[] => {
  const lines = text.split("\n");
  const chunks: TextChunk[] = [];
  let currentMetadataRun: MetadataItem[] = [];
  let currentTextRun: string[] = [];
  let runningOffset = 0;
  let textRunStartOffset = 0;

  const flushText = () => {
    if (currentTextRun.length > 0) {
      chunks.push({
        type: "text",
        content: currentTextRun.join("\n"),
        startIndex: textRunStartOffset,
      });
      currentTextRun = [];
    }
  };

  const flushMetadata = () => {
    if (currentMetadataRun.length > 0) {
      if (currentMetadataRun.length >= 2) {
        chunks.push({ type: "metadata", items: currentMetadataRun });
      } else {
        const single = currentMetadataRun[0];
        if (currentTextRun.length === 0) {
          textRunStartOffset = runningOffset - (single.key.length + 3 + single.value.length + 1);
        }
        currentTextRun.push(`${single.key} : ${single.value}`);
      }
      currentMetadataRun = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const meta = isMetadataLine(line);
    
    if (meta) {
      flushText();
      currentMetadataRun.push(meta);
    } else {
      if (currentTextRun.length === 0) {
        textRunStartOffset = runningOffset;
      }
      currentTextRun.push(line);
      flushMetadata();
    }
    
    runningOffset += line.length + 1; // +1 for the newline
  }
  flushText();
  flushMetadata();

  return chunks;
};

const getChunkEntities = (entities: TelegramEntity[] | undefined, startIndex: number, length: number): TelegramEntity[] => {
  if (!entities) return [];
  const chunkEnd = startIndex + length;
  return entities
    .filter(ent => ent.offsetUtf16 >= startIndex && ent.offsetUtf16 + ent.lengthUtf16 <= chunkEnd)
    .map(ent => ({
      ...ent,
      offsetUtf16: ent.offsetUtf16 - startIndex,
    }));
};

interface MessageBubbleProps {
  message: ChatMessage;
  isNew?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isNew }) => {
  const { userRole, t } = useApp();

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  if (message.direction === "system") {
    return (
      <div
        className={isNew ? "message-entry" : ""}
        style={{
          display: "flex",
          justifyContent: "center",
          margin: "6px 0",
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
            color: "var(--text-secondary)",
            maxWidth: "80%",
            textAlign: "center",
          }}
        >
          {message.text}
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
  const isDeleted = message.status === "deleted";

  return (
    <div
      className={isNew ? "message-entry" : ""}
      style={{
        display: "flex",
        justifyContent: isOutgoing ? "flex-end" : "flex-start",
        margin: "4px 0",
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
          transition: "all 0.3s ease",
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
            marginBottom: "2px",
            padding: "0 4px",
            opacity: isDeleted ? 0.65 : 1,
            transition: "opacity 0.3s ease",
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
          className="message-bubble-body"
          style={{
            backgroundColor: isDeleted
              ? (isOutgoing ? "rgba(59, 130, 246, 0.08)" : "rgba(148, 163, 184, 0.06)")
              : (isOutgoing ? "var(--bubble-outgoing)" : "var(--bubble-incoming)"),
            border: isDeleted
              ? (isOutgoing ? "1px dashed rgba(59, 130, 246, 0.3)" : "1px dashed var(--border-color)")
              : (isOutgoing ? "1px solid transparent" : "1px solid var(--border-color)"),
            borderRadius: isOutgoing ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
            padding: "6px 10px",
            position: "relative",
            width: "100%",
            boxShadow: isDeleted ? "none" : "var(--shadow-sm)",
            borderLeft: !isDeleted && message.status === "failed" ? "3px solid var(--accent-red)" : undefined,
          }}
        >
          {isDeleted ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontStyle: "italic",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                padding: "2px 0",
              }}
            >
              <Trash2 size={12} style={{ opacity: 0.7, color: "var(--accent-red)" }} />
              <span>{t("messageDeleted") || "[Message Deleted]"}</span>
            </div>
          ) : (
            <>
              {/* Main Text */}
              {message.text && (
                <div
                  style={{
                    fontSize: "0.9rem",
                    lineHeight: "1.4",
                    color: message.status === "failed" ? "rgba(255,255,255,0.7)" : (isOutgoing ? "var(--bubble-outgoing-text)" : "var(--bubble-incoming-text)"),
                    wordBreak: "break-word",
                  }}
                >
                  {(() => {
                    const chunks = parseMessageChunks(message.text);
                    const hasMetadata = chunks.some(chunk => chunk.type === "metadata");
                    
                    if (!hasMetadata) {
                      return (
                        <div style={{ whiteSpace: "pre-wrap" }}>
                          <EntityTextRenderer text={message.text} entities={message.entities} />
                        </div>
                      );
                    }

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {chunks.map((chunk, idx) => {
                          if (chunk.type === "text") {
                            const chunkEntities = getChunkEntities(message.entities, chunk.startIndex, chunk.content.length);
                            return (
                              <div key={idx} style={{ whiteSpace: "pre-wrap" }}>
                                <EntityTextRenderer text={chunk.content} entities={chunkEntities} />
                              </div>
                            );
                          } else {
                            return (
                              <div
                                key={idx}
                                style={{
                                  backgroundColor: isOutgoing ? "rgba(255, 255, 255, 0.12)" : "rgba(15, 23, 42, 0.03)",
                                  border: isOutgoing ? "1px solid rgba(255, 255, 255, 0.18)" : "1px solid rgba(15, 23, 42, 0.06)",
                                  borderRadius: "6px",
                                  padding: "4px 8px",
                                  display: "grid",
                                  gridTemplateColumns: "auto 1fr",
                                  rowGap: "2px",
                                  columnGap: "10px",
                                  alignItems: "baseline",
                                  margin: "2px 0",
                                }}
                              >
                                {chunk.items.map((item, itemIdx) => (
                                  <React.Fragment key={itemIdx}>
                                    <span
                                      style={{
                                        fontSize: "0.65rem",
                                        fontWeight: 600,
                                        color: isOutgoing ? "rgba(255, 255, 255, 0.75)" : "var(--text-secondary)",
                                        letterSpacing: "0.05em",
                                        textTransform: "uppercase",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {item.key}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "0.75rem",
                                        fontWeight: 500,
                                        color: isOutgoing ? "#ffffff" : "var(--text-primary)",
                                        wordBreak: "break-word",
                                      }}
                                    >
                                      {item.value}
                                    </span>
                                  </React.Fragment>
                                ))}
                              </div>
                            );
                          }
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}

          {/* Collapsible Section for Media and Keyboards */}
          <div className={`message-collapsible-section ${isDeleted ? "collapsed" : ""}`}>
            {/* Media Attachments */}
            {message.media && message.media.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: message.text ? "4px" : "0" }}>
                {message.media.map((med, idx) => (
                  <MediaPreview key={idx} media={med} messageId={message.id} />
                ))}
              </div>
            )}

            {/* Inline Keyboard Preview */}
            {message.inlineKeyboard && (
              <InlineKeyboardPreview botId={message.botId} messageId={message.id} keyboard={message.inlineKeyboard} />
            )}
          </div>

          {/* Status & Time Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "4px",
              marginTop: "4px",
              fontSize: "0.65rem",
              color: isDeleted ? "var(--text-muted)" : (isOutgoing ? "rgba(255, 255, 255, 0.7)" : "var(--text-muted)"),
            }}
          >
            {!isDeleted && message.editedAt && <span>edited</span>}
            <span>{formatTime(message.createdAt)}</span>
            {!isDeleted && isOutgoing && (
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
