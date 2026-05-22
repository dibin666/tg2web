import React from "react";
import { useApp } from "../context/AppContext";
import { DownloadProgress } from "../components/DownloadProgress";
import { Download, File, HardDrive, ShieldAlert } from "lucide-react";

export const DownloadsPage: React.FC = () => {
  const { downloads } = useApp();

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "var(--accent-green)";
      case "downloading":
      case "queued":
        return "var(--accent-blue-hover)";
      case "failed":
        return "var(--accent-red)";
      default:
        return "var(--text-muted)";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-chat)",
        padding: "24px",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "24px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: "700", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
          <Download size={20} style={{ color: "var(--accent-blue)" }} />
          <span>Server Proxy Downloads Queue</span>
        </h1>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "6px", lineHeight: "1.4" }}>
          This page displays file downloads processed through the shared service account. Files are cached locally on the server first, then streamed to the browser to enforce secure audit boundaries.
        </p>
      </div>

      {/* Security Banner Note */}
      <div
        style={{
          backgroundColor: "rgba(59, 130, 246, 0.05)",
          border: "1px solid var(--border-color)",
          borderRadius: "6px",
          padding: "12px 16px",
          display: "flex",
          gap: "10px",
          fontSize: "0.75rem",
          lineHeight: "1.5",
          color: "var(--text-secondary)",
          marginBottom: "20px",
        }}
      >
        <ShieldAlert size={18} style={{ color: "var(--accent-blue)", flexShrink: 0 }} />
        <div>
          <strong>Server Proxy Safeguard</strong>: Browser connections never fetch files directly from Telegram's CDN. Outgoing requests are masked by the relay server. Download logs are associated with internal users for team accountability.
        </div>
      </div>

      {/* Downloads List */}
      <div
        style={{
          backgroundColor: "var(--bg-sidebar)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <div
          className="downloads-table-header"
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 2fr",
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-color)",
            backgroundColor: "#f1f5f9",
            fontSize: "0.75rem",
            fontWeight: "bold",
            color: "var(--text-secondary)",
            letterSpacing: "0.05em",
          }}
        >
          <span>FILE NAME</span>
          <span>SIZE</span>
          <span>STATUS</span>
          <span style={{ textAlign: "right" }}>ACTION / PROGRESS</span>
        </div>

        {downloads.length === 0 ? (
          <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
            <HardDrive size={24} style={{ opacity: 0.3, marginBottom: "8px" }} />
            <div>No downloads triggered yet.</div>
            <div style={{ fontSize: "0.7rem", marginTop: "4px" }}>Click download on any media attachment in chat to begin.</div>
          </div>
        ) : (
          downloads.map((dl) => (
            <div
              key={dl.id}
              className="downloads-table-row"
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 2fr",
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-color)",
                alignItems: "center",
                fontSize: "0.8rem",
              }}
            >
              {/* File Info */}
              <div className="downloads-col-info" style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                <File size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontWeight: "500",
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={dl.fileName}
                  >
                    {dl.fileName || "telegram_file.bin"}
                  </span>
                  <div className="downloads-mobile-meta" style={{ display: "none", alignItems: "center", gap: "8px", fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                    <span>{formatBytes(dl.sizeBytes)}</span>
                    <span>•</span>
                    <span style={{ textTransform: "capitalize", fontWeight: "600", color: getStatusColor(dl.status) }}>
                      {dl.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Size */}
              <span className="downloads-col-size" style={{ color: "var(--text-secondary)" }}>{formatBytes(dl.sizeBytes)}</span>

              {/* Status */}
              <span className="downloads-col-status" style={{ textTransform: "capitalize", fontWeight: "600", color: getStatusColor(dl.status) }}>
                {dl.status}
              </span>

              {/* Action / Progress component */}
              <div className="downloads-col-action" style={{ display: "flex", justifyContent: "flex-end" }}>
                <DownloadProgress
                  fileId={dl.fileId}
                  fileName={dl.fileName}
                  sizeBytes={dl.sizeBytes}
                  messageId={dl.messageId}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
