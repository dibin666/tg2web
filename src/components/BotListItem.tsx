import React from "react";
import { BotSummary } from "../api/types";
import { useApp } from "../context/AppContext";
import { Pin, AlertOctagon } from "lucide-react";

interface BotListItemProps {
  bot: BotSummary;
}

export const BotListItem: React.FC<BotListItemProps> = ({ bot }) => {
  const { activeBotId, selectBot } = useApp();

  const isActive = activeBotId === bot.id;

  const getAvatarColor = (id: string) => {
    const colors = [
      "#3b82f6", // blue
      "#10b981", // green
      "#f59e0b", // yellow
      "#ef4444", // red
      "#8b5cf6", // purple
    ];
    // Hash ID to get a color index
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const initials = bot.title
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      onClick={() => selectBot(bot.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 12px",
        cursor: "pointer",
        borderRadius: "6px",
        backgroundColor: isActive ? "rgba(59, 130, 246, 0.08)" : "transparent",
        borderLeft: `3px solid ${isActive ? "var(--accent-blue)" : "transparent"}`,
        transition: "background-color 0.15s, border-left-color 0.15s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          backgroundColor: getAvatarColor(bot.id),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "bold",
          fontSize: "0.85rem",
          color: "white",
          flexShrink: 0,
        }}
      >
        {initials}
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: "600", color: isActive ? "white" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {bot.title}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {bot.isPinned && <Pin size={10} style={{ color: "var(--text-muted)", transform: "rotate(45deg)" }} />}
            {bot.status === "restricted" && (
              <span title="Restricted Bot" style={{ color: "var(--accent-red)", display: "inline-flex" }}>
                <AlertOctagon size={11} />
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {bot.lastMessagePreview || "No messages yet"}
        </div>
      </div>

      {/* Unread Count Badge */}
      {bot.unreadCount > 0 && (
        <span
          style={{
            backgroundColor: "var(--accent-blue)",
            color: "white",
            fontSize: "0.65rem",
            fontWeight: "bold",
            padding: "2px 6px",
            borderRadius: "10px",
            minWidth: "18px",
            textAlign: "center",
            display: "inline-block",
            flexShrink: 0,
          }}
        >
          {bot.unreadCount}
        </span>
      )}
    </div>
  );
};
