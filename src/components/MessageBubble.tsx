import React from "react";
import { ChatMessage, TelegramEntity } from "../api/types";
import { EntityTextRenderer } from "./EntityTextRenderer";
import { MediaPreview } from "./MediaPreview";
import { InlineKeyboardPreview } from "./InlineKeyboardPreview";
import { BotAvatar } from "./BotAvatar";
import { Check, CheckCheck, Clock, AlertTriangle, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useApp } from "../context/AppContext";
import { cn } from "@/lib/utils";

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

const formatTime = (isoString: string) => {
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const initialsOf = (name: string) =>
  name
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const UserAvatar: React.FC<{ name?: string }> = ({ name }) => (
  <div className="flex size-9 shrink-0 select-none items-center justify-center rounded-[11px] bg-foreground text-[13px] font-semibold text-background shadow-sm">
    {name ? initialsOf(name) : <UserRound className="size-4" />}
  </div>
);

interface MessageBubbleProps {
  message: ChatMessage;
  isNew?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isNew }) => {
  const { userRole, t, bots, selectedMessage, setSelectedMessage } = useApp();

  if (message.direction === "system") {
    return (
      <div className={cn("my-1.5 flex w-full justify-center", isNew && "message-entry")}>
        <div className="max-w-[80%] rounded-full border bg-bubble-system px-4 py-1.5 text-center text-xs text-muted-foreground">
          {message.text}
          {message.createdAt && <span className="ml-2 opacity-60">{formatTime(message.createdAt)}</span>}
        </div>
      </div>
    );
  }

  const isOutgoing = message.direction === "outgoing";
  const isDeleted = message.status === "deleted";
  const isSelected = selectedMessage?.id === message.id;
  const bot = bots.find((b) => b.id === message.botId);

  const toggleInspect = () => {
    setSelectedMessage(isSelected ? null : message);
  };

  return (
    <div
      className={cn(
        "my-1 flex w-full items-end gap-2.5",
        isOutgoing && "flex-row-reverse",
        isNew && "message-entry"
      )}
    >
      {/* Avatar */}
      {isOutgoing ? (
        <UserAvatar name={message.sentByInternalUser?.displayName} />
      ) : (
        <BotAvatar id={message.botId} title={bot?.title || "Bot"} size={36} />
      )}

      <div className={cn("flex max-w-[78%] min-w-[140px] flex-col", isOutgoing ? "items-end" : "items-start")}>
        {/* Attribution */}
        <div className={cn("mb-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground", isDeleted && "opacity-60")}>
          {isOutgoing ? (
            userRole === "admin" && message.sentByInternalUser && (
              <span className="inline-flex items-center gap-1 font-medium text-primary">
                <ShieldCheck className="size-3" />
                {message.sentByInternalUser.id === "user_key"
                  ? `${t("sentViaKey")} ${message.sentByInternalUser.displayName}`
                  : message.sentByInternalUser.displayName}
              </span>
            )
          ) : (
            <span className="font-medium text-foreground/80">
              {bot?.title || "Telegram Bot"}
              {userRole === "admin" && message.sentByInternalUser ? ` · for ${message.sentByInternalUser.displayName}` : ""}
            </span>
          )}
        </div>

        {/* Bubble body */}
        <div
          onClick={toggleInspect}
          className={cn(
            "relative w-full cursor-pointer border px-3.5 py-2.5 transition-shadow duration-200",
            isOutgoing
              ? "rounded-2xl rounded-br-md border-bubble-out-border bg-bubble-out"
              : "rounded-2xl rounded-bl-md border-bubble-in-border bg-bubble-in shadow-xs",
            isDeleted && "border-dashed bg-transparent shadow-none",
            !isDeleted && message.status === "failed" && "border-destructive/50 ring-1 ring-destructive/30",
            isSelected && "ring-2 ring-ring/60"
          )}
        >
          {isDeleted ? (
            <div className="flex items-center gap-2 py-0.5 text-sm italic text-muted-foreground">
              <Trash2 className="size-3.5 text-destructive/70" />
              <span>{t("messageDeleted") || "[Message Deleted]"}</span>
            </div>
          ) : (
            message.text && (
              <div className="break-words text-sm leading-relaxed text-foreground">
                {(() => {
                  const chunks = parseMessageChunks(message.text);
                  const hasMetadata = chunks.some((chunk) => chunk.type === "metadata");

                  if (!hasMetadata) {
                    return (
                      <div className="whitespace-pre-wrap">
                        <EntityTextRenderer text={message.text} entities={message.entities} />
                      </div>
                    );
                  }

                  return (
                    <div className="flex flex-col gap-2">
                      {chunks.map((chunk, idx) =>
                        chunk.type === "text" ? (
                          <div key={idx} className="whitespace-pre-wrap">
                            <EntityTextRenderer
                              text={chunk.content}
                              entities={getChunkEntities(message.entities, chunk.startIndex, chunk.content.length)}
                            />
                          </div>
                        ) : (
                          <div
                            key={idx}
                            className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5 rounded-lg border border-foreground/8 bg-foreground/4 px-2.5 py-1.5"
                          >
                            {chunk.items.map((item, itemIdx) => (
                              <React.Fragment key={itemIdx}>
                                <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  {item.key}
                                </span>
                                <span className="break-words text-xs font-medium text-foreground">{item.value}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  );
                })()}
              </div>
            )
          )}

          {/* Media & inline keyboards */}
          {!isDeleted && (
            <>
              {message.media && message.media.length > 0 && (
                <div className={cn("flex flex-col gap-2", message.text && "mt-2")}>
                  {message.media.map((med, idx) => (
                    <MediaPreview key={idx} media={med} messageId={message.id} />
                  ))}
                </div>
              )}
              {message.inlineKeyboard && (
                <InlineKeyboardPreview botId={message.botId} messageId={message.id} keyboard={message.inlineKeyboard} />
              )}
            </>
          )}

          {/* Footer: time & status */}
          <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
            {!isDeleted && message.editedAt && <span>已编辑</span>}
            <span>{formatTime(message.createdAt)}</span>
            {!isDeleted && isOutgoing && (
              <span className="inline-flex items-center">
                {message.status === "pending" && <Clock className="size-3 animate-pulse" />}
                {message.status === "sent" && <Check className="size-3" />}
                {(message.status === "received" || message.status === "edited") && (
                  <CheckCheck className="size-3 text-primary" />
                )}
                {message.status === "failed" && (
                  <span className="inline-flex items-center gap-0.5 font-medium text-destructive">
                    <AlertTriangle className="size-3" />
                    <span>发送失败</span>
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
