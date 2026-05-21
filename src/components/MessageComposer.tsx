import React, { useState, useRef } from "react";
import { useApp } from "../context/AppContext";
import { Send, Paperclip, Terminal, AlertOctagon } from "lucide-react";

export const MessageComposer: React.FC = () => {
  const { sendMessage, connectionStatus, bots, activeBotId, t } = useApp();
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
    { name: "/help", desc: t("helpDesc") },
    { name: "/status", desc: t("statusDesc") },
    { name: "/schedule", desc: t("scheduleDesc") },
    { name: "/download_all", desc: t("downloadDesc") },
    { name: "/reset", desc: t("resetDesc") },
  ];

  if (isRestricted) {
    return (
      <div
        style={{
          borderTop: "1px solid var(--border-color)",
          backgroundColor: "rgba(239, 68, 68, 0.03)",
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          color: "var(--accent-red)",
          fontSize: "0.8rem",
        }}
      >
        <AlertOctagon size={18} />
        <div>
          {t("restrictedChat")}
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
      {/* Bot command autocomplete list (White Theme) */}
      {showCommands && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "12px",
            right: "12px",
            backgroundColor: "var(--bg-panel)",
            border: "1px solid var(--border-color)",
            borderRadius: "8px",
            boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.06)",
            zIndex: 10,
            overflow: "hidden",
            marginBottom: "8px",
          }}
          className="animate-slide-up"
        >
          <div
            style={{
              padding: "8px 12px",
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: "600",
              letterSpacing: "0.02em",
            }}
          >
            <Terminal size={12} />
            <span>{t("availableCommands")}</span>
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
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-app)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <span style={{ color: "var(--accent-blue)", fontFamily: "var(--font-mono)", fontWeight: "600" }}>
                {cmd.name}
              </span>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                {cmd.desc}
              </span>
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
            backgroundColor: "var(--bg-panel)",
            border: "1px solid var(--border-color)",
            padding: "10px 16px",
            borderRadius: "8px",
            fontSize: "0.8rem",
            color: "var(--accent-green)",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Paperclip size={14} className="animate-pulse-slow" />
          <span>{t("attachmentMock")}</span>
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
            backgroundColor: "transparent",
            border: "1px solid var(--border-color)",
            color: isOffline ? "var(--text-muted)" : "var(--text-secondary)",
            cursor: isOffline ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "38px",
            width: "38px",
            transition: "all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)",
          }}
          onMouseEnter={(e) => !isOffline && (e.currentTarget.style.backgroundColor = "var(--bg-app)")}
          onMouseLeave={(e) => !isOffline && (e.currentTarget.style.backgroundColor = "transparent")}
          title={t("attachTooltip")}
        >
          <Paperclip size={18} />
        </button>

        {/* Text Input (White Theme) */}
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
                ? "Disconnected..."
                : t("typePrompt")
            }
            style={{
              width: "100%",
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              padding: "10px 12px",
              color: "var(--text-primary)",
              fontSize: "0.85rem",
              resize: "none",
              outline: "none",
              fontFamily: "var(--font-sans)",
              lineHeight: "1.4",
              display: "block",
              maxHeight: "150px",
              overflowY: "auto",
              transition: "border-color 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)",
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
            backgroundColor: isDisabled ? "transparent" : "var(--accent-blue)",
            color: isDisabled ? "var(--text-muted)" : "white",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isDisabled ? "not-allowed" : "pointer",
            border: `1px solid ${isDisabled ? "var(--border-color)" : "var(--accent-blue)"}`,
            transition: "all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)",
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
