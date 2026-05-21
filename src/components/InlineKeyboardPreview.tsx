import React, { useState } from "react";
import { AlertCircle } from "lucide-react";

interface InlineKeyboardPreviewProps {
  keyboard?: {
    inline_keyboard: Array<Array<{
      text: string;
      url?: string;
      callback_data?: string;
    }>>;
  };
}

export const InlineKeyboardPreview: React.FC<InlineKeyboardPreviewProps> = ({ keyboard }) => {
  const [toast, setToast] = useState<string | null>(null);

  if (!keyboard || !keyboard.inline_keyboard || keyboard.inline_keyboard.length === 0) {
    return null;
  }

  const handleButtonClick = (button: { text: string; url?: string; callback_data?: string }) => {
    if (button.url) {
      // Simulate url redirect (we can open it in a new window or just alert)
      setToast(`Redirecting to URL: ${button.url}`);
    } else if (button.callback_data) {
      // Simulate callback click (bot payload event)
      setToast(`Callback trigger fired: [${button.callback_data}]`);
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
                handleButtonClick(btn);
              }}
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
                cursor: "pointer",
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
              {btn.text}
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
