import React from "react";
import { PendingDraft } from "../api/types";
import { EntityTextRenderer } from "./EntityTextRenderer";
import { BotAvatar } from "./BotAvatar";
import { Sparkles, Terminal } from "lucide-react";
import { useApp } from "../context/AppContext";

interface PendingDraftBubbleProps {
  draft: PendingDraft;
}

export const PendingDraftBubble: React.FC<PendingDraftBubbleProps> = ({ draft }) => {
  const { bots } = useApp();
  const bot = bots.find((b) => b.id === draft.botId);

  return (
    <div className="message-entry my-1 flex w-full items-end gap-2.5">
      <BotAvatar id={draft.botId} title={bot?.title || "Bot"} size={36} />

      <div className="flex min-w-[180px] max-w-[78%] flex-col items-start">
        {/* Label */}
        <div className="mb-1 flex items-center gap-1 px-1 text-[11px] font-medium text-primary">
          <Sparkles className="size-3 animate-pulse" />
          <span>Telegram 草稿流式传输中...</span>
        </div>

        {/* Draft body */}
        <div className="w-full rounded-2xl rounded-bl-md border border-dashed border-primary/50 bg-primary/5 px-3.5 py-2.5">
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            <EntityTextRenderer text={draft.text} entities={draft.entities} />
            <span className="typing-caret ml-0.5 inline-block h-3.5 w-1 translate-y-0.5 rounded-full bg-primary" />
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Terminal className="size-2.5" />
              <span className="font-mono">{draft.draftId}</span>
            </span>
            <span>{new Date(draft.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
