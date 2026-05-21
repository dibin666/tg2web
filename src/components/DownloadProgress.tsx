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
  const { downloads, downloadMedia } = useApp();

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
        <span>Download ({formatBytes(sizeBytes)})</span>
      </button>
    );
  }

  const { status, downloadedBytes, error, proxyUrl } = activeDownload;
  const total = sizeBytes || activeDownload.sizeBytes || 0;
  const progressPercent = total > 0 ? Math.min(100, Math.round((downloadedBytes / total) * 100)) : 0;

  switch (status) {
    case "queued":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%", maxWidth: "250px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            <Loader size={12} className="animate-pulse-slow" />
            <span>Queued in Server Proxy...</span>
          </div>
        </div>
      );

    case "downloading":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%", maxWidth: "250px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            <span>Downloading on Server...</span>
            <span>{progressPercent}%</span>
          </div>
          <div style={{ height: "4px", backgroundColor: "#334155", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPercent}%`, backgroundColor: "var(--accent-blue)", transition: "width 0.2s" }} />
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", alignSelf: "flex-end" }}>
            {formatBytes(downloadedBytes)} / {formatBytes(total)}
          </div>
        </div>
      );

    case "ready":
      return (
        <a
          href={proxyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          style={{
            padding: "4px 8px",
            fontSize: "0.8rem",
            backgroundColor: "var(--accent-green)",
            gap: "4px",
          }}
          onClick={(e) => {
            // Stop propagation so it doesn't open the chat view message inspector
            e.stopPropagation();
          }}
        >
          <CheckCircle size={12} />
          <span>Save to Local ({formatBytes(total)})</span>
        </a>
      );

    case "failed":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--accent-red)" }}>
          <AlertCircle size={12} />
          <span title={error || "Failed to download"}>Download Failed</span>
          <button onClick={handleDownload} style={{ color: "var(--accent-blue)", textDecoration: "underline", fontSize: "0.75rem", cursor: "pointer" }}>
            Retry
          </button>
        </div>
      );

    case "expired":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <span>Cache Expired</span>
          <button onClick={handleDownload} style={{ color: "var(--accent-blue)", textDecoration: "underline", fontSize: "0.75rem", cursor: "pointer" }}>
            Refetch
          </button>
        </div>
      );

    default:
      return null;
  }
};
