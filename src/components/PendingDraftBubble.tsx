import React from "react";
import { PendingDraft } from "../api/types";
import { EntityTextRenderer } from "./EntityTextRenderer";
import { Sparkles, Terminal } from "lucide-react";

interface PendingDraftBubbleProps {
  draft: PendingDraft;
}

export const PendingDraftBubble: React.FC<PendingDraftBubbleProps> = ({ draft }) => {
  return (
    <div
      className="message-entry"
      style={{
        display: "flex",
        justifyContent: "flex-start",
        margin: "4px 0",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          maxWidth: "75%",
          minWidth: "180px",
        }}
      >
        {/* Label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "0.7rem",
            color: "var(--accent-blue-hover)",
            marginBottom: "2px",
            padding: "0 4px",
            fontWeight: "600",
          }}
        >
          <Sparkles size={10} className="animate-pulse-slow" />
          <span>Telegram Draft Streaming...</span>
        </div>

        {/* Draft Bubble body */}
        <div
          style={{
            backgroundColor: "var(--bubble-draft)",
            border: "1px dashed var(--accent-blue)",
            borderRadius: "12px 12px 12px 2px",
            padding: "6px 10px",
            position: "relative",
            width: "100%",
            boxShadow: "0 0 10px rgba(59, 130, 246, 0.15)",
            transition: "all 0.25s ease",
          }}
        >
          {/* Main text */}
          <div
            style={{
              fontSize: "0.9rem",
              lineHeight: "1.4",
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            <EntityTextRenderer text={draft.text} entities={draft.entities} />
            <span
              style={{
                display: "inline-block",
                width: "4px",
                height: "14px",
                backgroundColor: "var(--accent-blue)",
                marginLeft: "3px",
                verticalAlign: "middle",
              }}
              className="animate-pulse-slow"
            />
          </div>

          {/* Footer details */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "6px",
              fontSize: "0.6rem",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
              <Terminal size={8} />
              <span>ID: {draft.draftId}</span>
            </span>
            <span>
              Live {new Date(draft.receivedAt).toLocaleTimeString([], { second: "2-digit" })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
