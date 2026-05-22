import React, { useRef, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { MessageBubble } from "../components/MessageBubble";
import { PendingDraftBubble } from "../components/PendingDraftBubble";
import { MessageComposer } from "../components/MessageComposer";
import { Bot } from "lucide-react";

export const ChatPage: React.FC = () => {
  const { bots, activeBotId, messages, pendingDrafts, loading } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);

  const activeBot = bots.find((b) => b.id === activeBotId);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = containerRef.current;
    if (!container) return;

    const applyScroll = () => {
      container.scrollTo({ top: container.scrollHeight, behavior });
    };

    requestAnimationFrame(() => {
      applyScroll();
      requestAnimationFrame(applyScroll);
      window.setTimeout(applyScroll, 90);
    });
  }, []);

  // Auto Scroll to Bottom on bot switch, new message, media load, or new draft.
  useEffect(() => {
    scrollToBottom("auto");
  }, [activeBotId, messages.length, pendingDrafts.length, scrollToBottom]);

  if (loading) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "var(--bg-chat)", color: "var(--text-muted)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
          <div className="animate-pulse-slow" style={{ fontSize: "0.85rem" }}>Loading portal communications...</div>
        </div>
      </div>
    );
  }

  if (!activeBotId || !activeBot) {
    return (
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-chat)",
          color: "var(--text-muted)",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <Bot size={48} style={{ marginBottom: "16px", opacity: 0.3 }} />
        <h3 style={{ color: "var(--text-secondary)", marginBottom: "6px" }}>No Conversation Selected</h3>
        <p style={{ fontSize: "0.8rem", maxWidth: "320px", lineHeight: "1.5" }}>
          Select a published bot from the left sidebar to inspect the shared Telegram conversation.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-chat)",
      }}
    >
      {/* Bot Chat Header */}
      <div
        className="chat-header"
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--border-color)",
          backgroundColor: "var(--bg-sidebar)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className="chat-header-info">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h1 style={{ fontSize: "0.95rem", fontWeight: "700", color: "var(--text-primary)" }}>
              {activeBot.title}
            </h1>
            <span
              style={{
                fontSize: "0.7rem",
                padding: "2px 6px",
                borderRadius: "4px",
                backgroundColor:
                  activeBot.status === "available"
                    ? "var(--accent-green-transparent)"
                    : "var(--accent-red-transparent)",
                color:
                  activeBot.status === "available"
                    ? "var(--accent-green)"
                    : "var(--accent-red)",
                fontWeight: "bold",
              }}
            >
              {activeBot.status}
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            @{activeBot.username || "unknown_bot"} • Shared Telegram Chat
          </span>
        </div>

        {/* Small header details */}
        <div className="chat-header-details" style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "12px" }}>
          <span>Telegram Chat ID: <code style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{activeBot.telegramChatId}</code></span>
        </div>
      </div>

      {/* Messages Thread Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          overflowAnchor: "none",
        }}
      >
        {messages.length === 0 && pendingDrafts.length === 0 ? (
          <div
            style={{
              margin: "auto",
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--text-muted)",
              maxWidth: "400px",
            }}
          >
            <Bot size={36} style={{ opacity: 0.2, marginBottom: "12px" }} />
            <h4 style={{ color: "var(--text-secondary)", fontSize: "0.85rem", fontWeight: "600", marginBottom: "4px" }}>
              Beginning of Conversation
            </h4>
            <p style={{ fontSize: "0.75rem", lineHeight: "1.4" }}>
              This conversation history is currently empty. New Telegram messages will appear here as they arrive.
            </p>
          </div>
        ) : (
          <>
            {/* Historical and active messages */}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Live Streaming Draft Bubble */}
            {pendingDrafts.map((draft) => (
              <PendingDraftBubble key={draft.id} draft={draft} />
            ))}
          </>
        )}
      </div>

      {/* Composer Input */}
      <MessageComposer key={activeBotId || "none"} />
    </div>
  );
};
