import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { List, X, RefreshCw, Check, SkipForward, Trash2, ChevronDown, ChevronUp, Disc } from "lucide-react";

export const DownloadQueueWidget: React.FC = () => {
  const {
    downloadQueue,
    skipDownloadQueueItem,
    markDownloadQueueItemComplete,
    clearDownloadQueue,
  } = useApp();

  const [expanded, setExpanded] = useState(false);

  const activeItem = downloadQueue.find((item) => item.status === "downloading");
  const queuedItems = downloadQueue.filter((item) => item.status === "queued");
  const completedItemsCount = downloadQueue.filter((item) => item.status === "completed").length;
  const failedItemsCount = downloadQueue.filter((item) => item.status === "failed").length;

  if (downloadQueue.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        fontFamily: "Inter, system-ui, sans-serif",
        marginLeft: "8px",
      }}
    >
      {/* Expanded Panel */}
      {expanded && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: "0",
            width: "360px",
            maxHeight: "500px",
            backgroundColor: "#ffffff",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--border-color)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)",
            color: "var(--text-primary)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 1000,
            animation: "slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: "rgba(241, 245, 249, 0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <List size={16} style={{ color: "var(--accent-blue)" }} />
              <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--text-primary)" }}>下载队列管理</span>
              <span
                style={{
                  fontSize: "0.7rem",
                  backgroundColor: "var(--accent-blue)",
                  color: "white",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  fontWeight: "bold",
                }}
              >
                {queuedItems.length + (activeItem ? 1 : 0)}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                onClick={clearDownloadQueue}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#ef4444";
                  e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                清空队列
              </button>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  padding: "2px",
                  borderRadius: "4px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Active Item Details */}
            {activeItem ? (
              <div
                style={{
                  backgroundColor: "rgba(59, 130, 246, 0.03)",
                  border: "1px solid rgba(59, 130, 246, 0.15)",
                  borderRadius: "8px",
                  padding: "12px",
                }}
              >
                <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                  {activeItem.coverUrl ? (
                    <img
                      src={activeItem.coverUrl}
                      alt={activeItem.title}
                      style={{ width: "48px", height: "48px", borderRadius: "6px", objectFit: "cover", border: "1px solid var(--border-color)" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "6px",
                        backgroundColor: "var(--bg-app)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Disc size={20} style={{ color: "var(--text-muted)" }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {activeItem.title}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }}>
                      {activeItem.artist}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                      <RefreshCw size={10} style={{ animation: "spin 1.5s linear infinite", color: "var(--accent-blue)" }} />
                      <span style={{ fontSize: "0.68rem", color: "var(--accent-blue)", fontWeight: "500" }}>正在下载推送任务...</span>
                    </div>
                  </div>
                </div>

                {/* Log Console */}
                <div
                  style={{
                    backgroundColor: "var(--bg-app)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    padding: "8px",
                    height: "80px",
                    overflowY: "auto",
                    fontFamily: "monospace",
                    fontSize: "0.68rem",
                    color: "var(--text-secondary)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  {activeItem.logs.length === 0 ? (
                    <span style={{ color: "#475569" }}>等待机器人响应...</span>
                  ) : (
                    activeItem.logs.map((log, index) => (
                      <div key={index} style={{ wordBreak: "break-all", lineHeight: "1.3" }}>
                        <span style={{ color: "#3b82f6" }}>&gt;</span> {log}
                      </div>
                    ))
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <button
                    onClick={() => markDownloadQueueItemComplete(activeItem.id)}
                    style={{
                      flex: 1,
                      backgroundColor: "rgba(16, 185, 129, 0.2)",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                      borderRadius: "6px",
                      color: "#34d399",
                      padding: "6px 0",
                      fontSize: "0.75rem",
                      fontWeight: "600",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(16, 185, 129, 0.3)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(16, 185, 129, 0.2)")}
                  >
                    <Check size={12} />
                    标记完成
                  </button>
                  <button
                    onClick={() => skipDownloadQueueItem(activeItem.id)}
                    style={{
                      flex: 1,
                      backgroundColor: "rgba(245, 158, 11, 0.15)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      borderRadius: "6px",
                      color: "#fbbf24",
                      padding: "6px 0",
                      fontSize: "0.75rem",
                      fontWeight: "600",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(245, 158, 11, 0.25)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(245, 158, 11, 0.15)")}
                  >
                    <SkipForward size={12} />
                    跳过任务
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: "24px 0",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                  border: "1px dashed var(--border-color)",
                  borderRadius: "8px",
                }}
              >
                没有正在下载的任务
              </div>
            )}

            {/* Upcoming Queue List */}
            {queuedItems.length > 0 && (
              <div>
                <div style={{ fontSize: "0.7rem", fontWeight: "bold", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                  等候中 ({queuedItems.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "150px", overflowY: "auto" }}>
                  {queuedItems.map((item, index) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px",
                        backgroundColor: "var(--bg-app)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                      }}
                    >
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: "bold", width: "16px", textAlign: "center" }}>
                        {index + 1}
                      </span>
                      {item.coverUrl ? (
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          style={{ width: "28px", height: "28px", borderRadius: "4px", objectFit: "cover" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "4px",
                            backgroundColor: "var(--bg-app)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Disc size={12} style={{ color: "var(--text-muted)" }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: "500", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.artist}
                        </div>
                      </div>
                      <button
                        onClick={() => skipDownloadQueueItem(item.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: "4px",
                          borderRadius: "4px",
                          display: "flex",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "#ef4444";
                          e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.05)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--text-muted)";
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        title="取消下载"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status Footer Metrics */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.68rem",
                color: "var(--text-muted)",
                borderTop: "1px solid var(--border-color)",
                paddingTop: "10px",
              }}
            >
              <span>已完成: {completedItemsCount}</span>
              <span>失败/跳过: {failedItemsCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          height: "26px",
          padding: "0 10px",
          borderRadius: "6px",
          backgroundColor: activeItem ? "var(--accent-blue-transparent)" : "var(--bg-app)",
          border: activeItem ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid var(--border-color)",
          color: activeItem ? "var(--accent-blue)" : "var(--text-secondary)",
          cursor: "pointer",
          boxShadow: "none",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.02)";
          if (!activeItem) {
            e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.03)";
            e.currentTarget.style.color = "var(--text-primary)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          if (!activeItem) {
            e.currentTarget.style.backgroundColor = "var(--bg-app)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }
        }}
      >
        {activeItem ? (
          <RefreshCw size={12} style={{ animation: "spin 2s linear infinite" }} />
        ) : (
          <List size={12} />
        )}
        <span style={{ fontSize: "0.75rem", fontWeight: "600" }}>
          {activeItem ? `正在下载 (${queuedItems.length + 1})` : `下载队列 (${queuedItems.length})`}
        </span>
        {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}

        {/* Counter Badge */}
        {queuedItems.length > 0 && !expanded && (
          <span
            style={{
              position: "absolute",
              top: "-6px",
              right: "-6px",
              backgroundColor: "#ef4444",
              color: "white",
              fontSize: "0.6rem",
              fontWeight: "bold",
              borderRadius: "50%",
              width: "16px",
              height: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1.5px solid var(--bg-sidebar)",
            }}
          >
            {queuedItems.length + (activeItem ? 1 : 0)}
          </span>
        )}
      </button>

      {/* Slideup keyframes */}
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
