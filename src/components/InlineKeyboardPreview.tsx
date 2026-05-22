import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import { apiClient } from "../api/client";

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
        setToast(response.text || "Button sent");
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Button failed");
      } finally {
        setBusyKey(null);
      }
    } else {
      setToast("Button clicked");
    }

    setTimeout(() => {
      setToast(null);
    }, 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px", width: "100%" }}>
      {keyboard.inline_keyboard.map((row, rowIdx) => (
        <div key={rowIdx} style={{ display: "flex", gap: "6px", flexWrap: "wrap", width: "100%" }}>
          {row.map((btn, btnIdx) => (
            <button
              key={btnIdx}
              onClick={(e) => {
                e.stopPropagation();
                void handleButtonClick(btn, `${rowIdx}:${btnIdx}`);
              }}
              disabled={busyKey !== null}
              style={{
                flex: 1,
                minWidth: "60px",
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border-color)",
                color: "var(--accent-blue-hover)",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                fontWeight: "500",
                cursor: busyKey === null ? "pointer" : "wait",
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                transition: "background-color 0.2s, border-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                e.currentTarget.style.borderColor = "var(--text-muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
                e.currentTarget.style.borderColor = "var(--border-color)";
              }}
            >
              {busyKey === `${rowIdx}:${btnIdx}` ? "..." : btn.text}
              {btn.url && " ↗"}
            </button>
          ))}
        </div>
      ))}
      {toast && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.75rem",
            color: "var(--accent-yellow)",
            backgroundColor: "var(--accent-yellow-transparent)",
            padding: "4px 8px",
            borderRadius: "4px",
            alignSelf: "flex-start",
            marginTop: "2px",
          }}
        >
          <AlertCircle size={12} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
};
