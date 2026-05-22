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
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Expanded Panel */}
      {expanded && (
        <div
          style={{
            width: "360px",
            maxHeight: "500px",
            backgroundColor: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
            color: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            marginBottom: "12px",
            overflow: "hidden",
            animation: "slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: "rgba(30, 41, 59, 0.4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <List size={18} style={{ color: "#60a5fa" }} />
              <span style={{ fontWeight: "600", fontSize: "0.9rem" }}>下载队列管理</span>
              <span
                style={{
                  fontSize: "0.7rem",
                  backgroundColor: "#3b82f6",
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
                  color: "#94a3b8",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#ef4444";
                  e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#94a3b8";
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
                  color: "#94a3b8",
                  cursor: "pointer",
                  display: "flex",
                  padding: "2px",
                  borderRadius: "4px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
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
                  backgroundColor: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid rgba(96, 165, 250, 0.2)",
                  borderRadius: "8px",
                  padding: "12px",
                }}
              >
                <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                  {activeItem.coverUrl ? (
                    <img
                      src={activeItem.coverUrl}
                      alt={activeItem.title}
                      style={{ width: "48px", height: "48px", borderRadius: "6px", objectFit: "cover", border: "1px solid rgba(255,255,255,0.05)" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "6px",
                        backgroundColor: "#1e293b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Disc size={20} style={{ color: "#475569" }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: "600", color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {activeItem.title}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }}>
                      {activeItem.artist}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                      <RefreshCw size={10} style={{ animation: "spin 1.5s linear infinite", color: "#60a5fa" }} />
                      <span style={{ fontSize: "0.68rem", color: "#60a5fa", fontWeight: "500" }}>正在下载推送任务...</span>
                    </div>
                  </div>
                </div>

                {/* Log Console */}
                <div
                  style={{
                    backgroundColor: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: "6px",
                    padding: "8px",
                    height: "80px",
                    overflowY: "auto",
                    fontFamily: "monospace",
                    fontSize: "0.68rem",
                    color: "#cbd5e1",
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
                  color: "#64748b",
                  fontSize: "0.8rem",
                  border: "1px dashed rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                }}
              >
                没有正在下载的任务
              </div>
            )}

            {/* Upcoming Queue List */}
            {queuedItems.length > 0 && (
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: "bold", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                  等候中 ({queuedItems.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
                  {queuedItems.map((item, index) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "8px",
                        backgroundColor: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: "6px",
                      }}
                    >
                      <span style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: "bold", width: "16px", textAlign: "center" }}>
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
                            backgroundColor: "#1e293b",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Disc size={12} style={{ color: "#475569" }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: "500", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.artist}
                        </div>
                      </div>
                      <button
                        onClick={() => skipDownloadQueueItem(item.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#64748b",
                          cursor: "pointer",
                          padding: "4px",
                          borderRadius: "4px",
                          display: "flex",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "#ef4444";
                          e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "#64748b";
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
                color: "#64748b",
                borderTop: "1px solid rgba(255, 255, 255, 0.05)",
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
          height: "44px",
          padding: "0 18px",
          borderRadius: "9999px",
          backgroundColor: activeItem ? "#2563eb" : "#1e293b",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          color: "white",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.05)";
          if (!activeItem) e.currentTarget.style.backgroundColor = "#334155";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          if (!activeItem) e.currentTarget.style.backgroundColor = "#1e293b";
        }}
      >
        {activeItem ? (
          <RefreshCw size={16} style={{ animation: "spin 2s linear infinite" }} />
        ) : (
          <List size={16} />
        )}
        <span style={{ fontSize: "0.82rem", fontWeight: "600" }}>
          {activeItem ? `正在下载 (${queuedItems.length + 1})` : `下载队列 (${queuedItems.length})`}
        </span>
        {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}

        {/* Counter Badge */}
        {queuedItems.length > 0 && !expanded && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              backgroundColor: "#ef4444",
              color: "white",
              fontSize: "0.65rem",
              fontWeight: "bold",
              borderRadius: "50%",
              width: "18px",
              height: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #0f172a",
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
