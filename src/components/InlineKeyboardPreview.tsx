import React, { useState } from "react";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { apiClient } from "../api/client";
import { cn } from "@/lib/utils";

interface InlineKeyboardPreviewProps {
  botId: string;
  messageId: string;
  keyboard?: {
    inline_keyboard: Array<Array<{
      text: string;
      url?: string;
      callback_data?: string;
    }>>;
  };
}

export const InlineKeyboardPreview: React.FC<InlineKeyboardPreviewProps> = ({ botId, messageId, keyboard }) => {
  const [toast, setToast] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (!keyboard || !keyboard.inline_keyboard || keyboard.inline_keyboard.length === 0) {
    return null;
  }

  const handleButtonClick = async (button: { text: string; url?: string; callback_data?: string }, key: string) => {
    if (button.url) {
      window.open(button.url, "_blank", "noopener,noreferrer");
      return;
    } else if (button.callback_data) {
      try {
        setBusyKey(key);
        const response = await apiClient.clickInlineKeyboardButton(botId, messageId, {
          callbackData: button.callback_data,
        });
        setToast(response.text || "按钮已发送");
      } catch (error) {
        setToast(error instanceof Error ? error.message : "按钮触发失败");
      } finally {
        setBusyKey(null);
      }
    } else {
      setToast("按钮已点击");
    }

    setTimeout(() => {
      setToast(null);
    }, 2000);
  };

  return (
    <div className="mt-2 flex w-full flex-col gap-1.5">
      {keyboard.inline_keyboard.map((row, rowIdx) => (
        <div key={rowIdx} className="flex w-full flex-wrap gap-1.5">
          {row.map((btn, btnIdx) => {
            const key = `${rowIdx}:${btnIdx}`;
            const isBusy = busyKey === key;
            return (
              <button
                key={btnIdx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleButtonClick(btn, key);
                }}
                disabled={busyKey !== null}
                className={cn(
                  "inline-flex min-w-16 flex-1 items-center justify-center gap-1 truncate rounded-lg border bg-card/70 px-3 py-1.5",
                  "text-xs font-medium text-primary transition-colors",
                  busyKey === null ? "hover:border-primary/40 hover:bg-primary/10" : "cursor-wait opacity-70"
                )}
              >
                {isBusy ? <Loader2 className="size-3 animate-spin" /> : <span className="truncate">{btn.text}</span>}
                {btn.url && <ExternalLink className="size-3 shrink-0 opacity-70" />}
              </button>
            );
          })}
        </div>
      ))}
      {toast && (
        <div className="mt-0.5 inline-flex items-center gap-1.5 self-start rounded-lg bg-[var(--warning-soft)] px-2.5 py-1 text-xs text-warning">
          <AlertCircle className="size-3" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
};
