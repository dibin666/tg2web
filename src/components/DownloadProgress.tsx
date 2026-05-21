import React from "react";
import { useApp } from "../context/AppContext";
import { Download, CheckCircle, AlertCircle, Loader } from "lucide-react";

interface DownloadProgressProps {
  fileId: string;
  fileName?: string;
  sizeBytes?: number;
  messageId?: string;
}

export const DownloadProgress: React.FC<DownloadProgressProps> = ({ fileId, fileName, sizeBytes, messageId }) => {
  const { downloads, downloadMedia, t } = useApp();

  const activeDownload = downloads.find((d) => d.fileId === fileId);

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleDownload = () => {
    downloadMedia(fileId, messageId, fileName, sizeBytes);
  };

  if (!activeDownload) {
    return (
      <button className="btn-secondary" onClick={handleDownload} style={{ padding: "4px 8px", fontSize: "0.8rem", gap: "4px" }}>
        <Download size={12} />
        <span>{t("downloadBtn")} ({formatBytes(sizeBytes)})</span>
      </button>
    );
  }

  const { status, downloadedBytes, error } = activeDownload;
  const total = sizeBytes || activeDownload.sizeBytes || 0;
  const progressPercent = total > 0 ? Math.min(100, Math.round((downloadedBytes / total) * 100)) : 0;

  switch (status) {
    case "queued":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          <Loader size={12} className="animate-pulse-slow" style={{ color: "var(--accent-blue)" }} />
          <span>{t("statusPreparing")}</span>
        </div>
      );

    case "downloading":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%", minWidth: "180px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>
            <span>{t("statusDownloading")} {progressPercent}%</span>
            <span>({formatBytes(downloadedBytes)} / {formatBytes(total)})</span>
          </div>
          <div style={{ height: "4px", backgroundColor: "var(--border-color)", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPercent}%`, backgroundColor: "var(--accent-blue)", transition: "width 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)" }} />
          </div>
        </div>
      );

    case "ready":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
          <span style={{ color: "var(--accent-green)", fontSize: "0.8rem", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <CheckCircle size={14} />
            <span>{t("savedStatusShort")}</span>
          </span>
          <button
            onClick={handleDownload}
            title={t("downloadAgainTooltip")}
            style={{
              color: "var(--accent-blue)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              borderRadius: "4px",
              border: "1px solid var(--border-color)",
              backgroundColor: "white",
              transition: "var(--transition-smooth)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-app)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "white"}
          >
            <Download size={11} />
          </button>
        </div>
      );

    case "failed":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--accent-red)" }} onClick={(e) => e.stopPropagation()}>
          <AlertCircle size={12} />
          <span title={error || t("statusFailed")}>{t("statusFailed")}</span>
          <button onClick={handleDownload} style={{ color: "var(--accent-blue)", textDecoration: "underline", fontSize: "0.75rem", cursor: "pointer" }}>
            {t("retryBtn")}
          </button>
        </div>
      );

    case "expired":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--text-muted)" }} onClick={(e) => e.stopPropagation()}>
          <span>{t("expiredStatus")}</span>
          <button onClick={handleDownload} style={{ color: "var(--accent-blue)", textDecoration: "underline", fontSize: "0.75rem", cursor: "pointer" }}>
            {t("refetchBtn")}
          </button>
        </div>
      );

    default:
      return null;
  }
};
