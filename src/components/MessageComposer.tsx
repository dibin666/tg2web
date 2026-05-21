import React, { useState, useRef } from "react";
import { useApp } from "../context/AppContext";
import { Send, Paperclip, Terminal, AlertOctagon } from "lucide-react";

export const MessageComposer: React.FC = () => {
  const { sendMessage, connectionStatus, bots, activeBotId } = useApp();
  const [text, setText] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [showUploadMock, setShowUploadMock] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeBot = bots.find((b) => b.id === activeBotId);
  const isOffline = connectionStatus === "offline";
  const isRestricted = activeBot?.status === "restricted";
  const isDisabled = isOffline || isRestricted || !text.trim();

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDisabled) return;

    try {
      await sendMessage(text.trim());
      setText("");
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
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    // Show bot commands popup if text starts with '/' or ends with '/'
    if (val === "/" || val.endsWith(" /")) {
      setShowCommands(true);
    } else {
      setShowCommands(false);
    }
  };

  const insertCommand = (cmd: string) => {
    setText(cmd + " ");
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const triggerUpload = () => {
    setShowUploadMock(true);
    setTimeout(() => {
      setShowUploadMock(false);
    }, 2500);
  };

  // Mock bot command shortcuts
  const mockCommands = [
    { name: "/help", desc: "Get bot help instructions" },
    { name: "/status", desc: "Show connection and TDLib status" },
    { name: "/schedule", desc: "Access the shared calendar scheduler" },
    { name: "/download_all", desc: "Fetch complete report files" },
    { name: "/reset", desc: "Clear intermediate prompt contexts" },
  ];

  if (isRestricted) {
    return (
      <div
        style={{
          borderTop: "1px solid var(--border-color)",
          backgroundColor: "rgba(239, 68, 68, 0.05)",
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          color: "var(--accent-red)",
          fontSize: "0.85rem",
        }}
      >
        <AlertOctagon size={18} />
        <div>
          <strong>Conversation Restricted</strong>: The shared Telegram service account is barred from sending messages to <em>{activeBot?.title}</em>.
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSend}
      style={{
        borderTop: "1px solid var(--border-color)",
        backgroundColor: "var(--bg-sidebar)",
        padding: "12px",
        position: "relative",
      }}
    >
      {/* Bot command autocomplete list */}
      {showCommands && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "12px",
            right: "12px",
            backgroundColor: "#1e293b",
            border: "1px solid var(--border-color)",
            borderRadius: "6px",
            boxShadow: "0 -4px 12px rgba(0,0,0,0.3)",
            zIndex: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "8px 12px", fontSize: "0.7rem", color: "var(--text-muted)", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", gap: "4px" }}>
            <Terminal size={12} />
            <span>AVAILABLE COMMAND SHUTTLES</span>
          </div>
          {mockCommands.map((cmd) => (
            <div
              key={cmd.name}
              onClick={() => insertCommand(cmd.name)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 12px",
                fontSize: "0.8rem",
                cursor: "pointer",
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <span style={{ color: "var(--accent-blue-hover)", fontFamily: "var(--font-mono)", fontWeight: "600" }}>{cmd.name}</span>
              <span style={{ color: "var(--text-secondary)" }}>{cmd.desc}</span>
            </div>
          ))}
        </div>
      )}

      {/* Upload mock dialog */}
      {showUploadMock && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%) translateY(-10px)",
            backgroundColor: "var(--bg-app)",
            border: "1px solid var(--border-color)",
            padding: "10px 16px",
            borderRadius: "6px",
            fontSize: "0.8rem",
            color: "var(--accent-green)",
            boxShadow: "var(--shadow-md)",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Paperclip size={14} className="animate-pulse-slow" />
          <span>Attachment Uploader Scaffolding Mock Triggered!</span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
        {/* Attachment Pin */}
        <button
          type="button"
          onClick={triggerUpload}
          disabled={isOffline}
          style={{
            padding: "8px",
            borderRadius: "6px",
            backgroundColor: "rgba(255,255,255,0.03)",
            border: "1px solid var(--border-color)",
            color: isOffline ? "var(--text-muted)" : "var(--text-secondary)",
            cursor: isOffline ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "38px",
            width: "38px",
          }}
          onMouseEnter={(e) => !isOffline && (e.currentTarget.style.color = "var(--text-primary)")}
          onMouseLeave={(e) => !isOffline && (e.currentTarget.style.color = "var(--text-secondary)")}
          title="Attach media/file placeholder"
        >
          <Paperclip size={18} />
        </button>

        {/* Text Input */}
        <div style={{ flex: 1, position: "relative" }}>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            disabled={isOffline}
            placeholder={
              isOffline
                ? "Disconnected from TDLib..."
                : "Type a prompt for the bot (use / for shortcuts)..."
            }
            style={{
              width: "100%",
              backgroundColor: "rgba(0,0,0,0.2)",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              padding: "10px 12px",
              color: "white",
              fontSize: "0.85rem",
              resize: "none",
              outline: "none",
              fontFamily: "var(--font-sans)",
              lineHeight: "1.4",
              display: "block",
              maxHeight: "150px",
              overflowY: "auto",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent-blue)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-color)")}
          />
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={isDisabled}
          style={{
            height: "38px",
            width: "38px",
            backgroundColor: isDisabled ? "rgba(255,255,255,0.02)" : "var(--accent-blue)",
            color: isDisabled ? "var(--text-muted)" : "white",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isDisabled ? "not-allowed" : "pointer",
            border: "1px solid var(--border-color)",
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => !isDisabled && (e.currentTarget.style.backgroundColor = "var(--accent-blue-hover)")}
          onMouseLeave={(e) => !isDisabled && (e.currentTarget.style.backgroundColor = "var(--accent-blue)")}
        >
          <Send size={16} />
        </button>
      </div>
    </form>
  );
};
