import React from "react";
import { useApp } from "../context/AppContext";
import { downloadProxyFile } from "../api/client";
import { Download, AlertCircle, Loader, Pause, Play, Square } from "lucide-react";

interface DownloadProgressProps {
  fileId: string;
  fileName?: string;
  sizeBytes?: number;
  messageId?: string;
}

export const DownloadProgress: React.FC<DownloadProgressProps> = ({ fileId, fileName, sizeBytes, messageId }) => {
  const { downloads, downloadMedia, pauseDownload, resumeDownload, stopDownload, t } = useApp();

  const activeDownload = downloads.find((d) => d.fileId === fileId && (d.messageId || "") === (messageId || ""))
    || downloads.find((d) => d.fileId === fileId);

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

  const handlePause = () => {
    if (activeDownload) void pauseDownload(activeDownload.id);
  };

  const handleResume = () => {
    if (activeDownload) void resumeDownload(activeDownload.id);
  };

  const handleStop = () => {
    if (activeDownload) void stopDownload(activeDownload.id);
  };

  const handleProxyDownload = async () => {
    if (!activeDownload?.proxyUrl) {
      handleDownload();
      return;
    }

    try {
      await downloadProxyFile(activeDownload.proxyUrl, activeDownload.fileName || fileName);
    } catch (error) {
      console.error("Proxy download failed", error);
    }
  };

  if (!activeDownload) {
    return (
      <button className="btn-download-action start" onClick={handleDownload}>
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
        <div className="download-progress-container-inline" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="status-pill downloading">
            <Loader size={12} className="animate-pulse-slow" />
            <span>{t("statusPreparing")}</span>
          </span>
          <div className="download-progress-actions" style={{ display: "flex", gap: "4px" }}>
            <button className="download-icon-button" onClick={handlePause} title={t("pauseBtn")} aria-label={t("pauseBtn")}>
              <Pause size={12} />
            </button>
            <button className="download-icon-button danger" onClick={handleStop} title={t("stopBtn")} aria-label={t("stopBtn")}>
              <Square size={11} />
            </button>
          </div>
        </div>
      );

    case "downloading":
      return (
        <div className="download-progress" onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "160px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-secondary)" }}>
            <span style={{ fontWeight: 600, color: "var(--accent-blue)" }}>{t("statusDownloading")} {progressPercent}%</span>
            <span>{formatBytes(downloadedBytes)} / {formatBytes(total)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className="download-progress-track" style={{ flex: 1, height: "4px", backgroundColor: "var(--border-color)", borderRadius: "2px", overflow: "hidden" }}>
              <div className="download-progress-bar" style={{ width: `${progressPercent}%`, height: "100%", backgroundColor: "var(--accent-blue)", borderRadius: "2px" }} />
            </div>
            <div className="download-progress-actions" style={{ display: "flex", gap: "4px" }}>
              <button className="download-icon-button" onClick={handlePause} title={t("pauseBtn")} aria-label={t("pauseBtn")}>
                <Pause size={12} />
              </button>
              <button className="download-icon-button danger" onClick={handleStop} title={t("stopBtn")} aria-label={t("stopBtn")}>
                <Square size={11} />
              </button>
            </div>
          </div>
        </div>
      );

    case "paused":
      return (
        <div className="download-progress-container-inline" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="status-pill paused">
            <Pause size={11} />
            <span>{t("statusPaused")} ({progressPercent}%)</span>
          </span>
          <div className="download-progress-actions" style={{ display: "flex", gap: "4px" }}>
            <button className="download-icon-button" onClick={handleResume} title={t("resumeBtn")} aria-label={t("resumeBtn")}>
              <Play size={12} />
            </button>
            <button className="download-icon-button danger" onClick={handleStop} title={t("stopBtn")} aria-label={t("stopBtn")}>
              <Square size={11} />
            </button>
          </div>
        </div>
      );

    case "ready":
      return (
        <button
          className="btn-download-action success"
          onClick={handleProxyDownload}
          title={t("downloadAgainTooltip")}
          style={{ cursor: "pointer" }}
        >
          <Download size={12} />
          <span>下载到本机</span>
        </button>
      );

    case "failed":
      return (
        <div className="download-progress-container-inline" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="status-pill failed" title={error || t("statusFailed")}>
            <AlertCircle size={11} />
            <span>{t("statusFailed")}</span>
          </span>
          <button className="btn-download-action retry" onClick={handleResume}>
            <Play size={10} />
            <span>{t("retryBtn")}</span>
          </button>
        </div>
      );

    case "stopped":
      return (
        <div className="download-progress-container-inline" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="status-pill failed">
            <Square size={11} />
            <span>{t("statusStopped")}</span>
          </span>
          <button className="btn-download-action retry" onClick={handleResume}>
            <Play size={10} />
            <span>{t("retryBtn")}</span>
          </button>
        </div>
      );

    case "expired":
      return (
        <div className="download-progress-container-inline" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="status-pill expired">
            <AlertCircle size={11} />
            <span>{t("expiredStatus")}</span>
          </span>
          <button className="btn-download-action expired" onClick={handleDownload}>
            <Download size={10} />
            <span>{t("refetchBtn")}</span>
          </button>
        </div>
      );

    default:
      return null;
  }
};
