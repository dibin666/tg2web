import React, { useState, useRef } from "react";
import { useApp } from "../context/AppContext";
import { apiClient } from "../api/client";
import { BotCommand } from "../api/types";
import { Send, Paperclip, Terminal, AlertOctagon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const MessageComposer: React.FC = () => {
  const { sendMessage, connectionStatus, bots, activeBotId, t } = useApp();
  const [text, setText] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [commandsBotId, setCommandsBotId] = useState<string | null>(null);
  const [commandsLoading, setCommandsLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeBotIdRef = useRef(activeBotId);

  React.useEffect(() => {
    activeBotIdRef.current = activeBotId;
  }, [activeBotId]);

  const activeBot = bots.find((b) => b.id === activeBotId);
  const isOffline = connectionStatus === "offline";
  const isRestricted = activeBot?.status === "restricted";
  const isDisabled = isOffline || isRestricted || !text.trim();
  const visibleCommands = commandsBotId === activeBotId ? commands : [];

  const requestCommands = React.useCallback(async (botId: string, retryIfEmpty: boolean) => {
    try {
      setCommandsLoading(true);
      const fetchedCommands = await apiClient.getBotCommands(botId);
      if (activeBotIdRef.current !== botId) return;

      setCommands(fetchedCommands);
      setCommandsBotId(botId);

      if (retryIfEmpty && fetchedCommands.length === 0) {
        window.setTimeout(() => {
          if (activeBotIdRef.current !== botId) return;
          void apiClient.getBotCommands(botId).then((lateCommands) => {
            if (activeBotIdRef.current !== botId) return;
            setCommands(lateCommands);
            setCommandsBotId(botId);
          }).catch((error) => {
            console.error("Failed to refresh bot commands", error);
          });
        }, 800);
      }
    } catch (error) {
      console.error("Failed to load bot commands", error);
      if (activeBotIdRef.current === botId) {
        setCommands([]);
        setCommandsBotId(botId);
      }
    } finally {
      if (activeBotIdRef.current === botId) {
        setCommandsLoading(false);
      }
    }
  }, []);

  const loadCommands = React.useCallback(() => {
    if (!activeBotId) return;
    void requestCommands(activeBotId, commandsBotId !== activeBotId);
  }, [activeBotId, commandsBotId, requestCommands]);

  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDisabled) return;

    try {
      await sendMessage(text.trim());
      setText("");
      requestAnimationFrame(autoGrow);
      inputRef.current?.focus();
    } catch (err) {
      console.error("Composer send failed", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
    if (e.key === "Escape") {
      setShowCommands(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    autoGrow();
    // Show bot commands popup if text starts with '/' or ends with ' /'
    if (val === "/" || val.endsWith(" /")) {
      setShowCommands(true);
      loadCommands();
    } else {
      setShowCommands(false);
    }
  };

  const insertCommand = (cmd: string) => {
    const command = cmd.startsWith("/") ? cmd : `/${cmd}`;
    setText((current) => {
      if (current === "/") return `${command} `;
      if (current.endsWith(" /")) return `${current.slice(0, -1)}${command} `;
      return `${current}${current.endsWith(" ") ? "" : " "}${command} `;
    });
    setShowCommands(false);
    inputRef.current?.focus();
  };

  if (isRestricted) {
    return (
      <div className="flex shrink-0 items-center gap-3 border-t bg-[var(--danger-soft)] px-5 py-4 text-sm text-destructive">
        <AlertOctagon className="size-4 shrink-0" />
        <span>{t("restrictedChat")}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSend} className="relative shrink-0 border-t bg-card px-4 py-3">
      <div className="relative mx-auto w-full max-w-3xl">
        {/* Slash command panel */}
        {showCommands && (
          <div className="message-entry glass-panel shadow-float absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-xl">
            <div className="flex items-center gap-2 border-b border-border/60 px-3.5 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
              <Terminal className="size-3" />
              <span>{t("availableCommands")}</span>
              {commandsLoading && <Loader2 className="size-3 animate-spin" />}
            </div>
            <div className="max-h-56 overflow-y-auto">
              {commandsLoading && visibleCommands.length === 0 && (
                <div className="px-3.5 py-2.5 text-sm text-muted-foreground">{t("commandsLoading")}</div>
              )}
              {!commandsLoading && visibleCommands.length === 0 && (
                <div className="px-3.5 py-2.5 text-sm text-muted-foreground">{t("commandsEmpty")}</div>
              )}
              {visibleCommands.map((cmd) => {
                const commandName = `/${cmd.command.replace(/^\//, "")}`;
                return (
                  <button
                    type="button"
                    key={commandName}
                    onClick={() => insertCommand(commandName)}
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="font-mono text-sm font-semibold text-primary">{commandName}</span>
                    <span className="truncate text-right text-xs text-muted-foreground">{cmd.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Input shell */}
        <div
          className={cn(
            "flex items-end gap-1.5 rounded-2xl border bg-background p-1.5 transition-shadow",
            "focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/25"
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled
            className="size-9 shrink-0 rounded-xl text-muted-foreground"
            title={t("attachmentUnavailable")}
          >
            <Paperclip className="size-[18px]" />
          </Button>

          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            disabled={isOffline}
            placeholder={isOffline ? "连接已断开..." : t("typePrompt")}
            className="max-h-40 min-h-9 flex-1 resize-none self-center bg-transparent px-1.5 py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />

          <Button
            type="submit"
            size="icon"
            disabled={isDisabled}
            className={cn(
              "size-9 shrink-0 rounded-xl text-white shadow-sm transition-all",
              isDisabled ? "bg-muted text-muted-foreground shadow-none" : "gradient-brand hover:opacity-90 active:scale-95"
            )}
            title={t("send")}
          >
            <Send className="size-4" />
          </Button>
        </div>

        <div className="mt-1.5 px-2 text-center text-[10px] text-muted-foreground/70 max-sm:hidden">
          Enter 发送 · Shift + Enter 换行 · 输入 / 呼出机器人指令
        </div>
      </div>
    </form>
  );
};
