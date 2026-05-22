import React from "react";
import { useApp } from "../context/AppContext";
import { downloadProxyFile } from "../api/client";
import { Download, CheckCircle, AlertCircle, Loader, Pause, Play, Square } from "lucide-react";

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
      <button className="btn-secondary download-action-button" onClick={handleDownload}>
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
        <div className="download-progress download-progress-inline" onClick={(e) => e.stopPropagation()}>
          <Loader size={12} className="animate-pulse-slow" style={{ color: "var(--accent-blue)" }} />
          <span className="download-progress-status">{t("statusPreparing")}</span>
          <div className="download-progress-actions">
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
        <div className="download-progress" onClick={(e) => e.stopPropagation()}>
          <div className="download-progress-meta">
            <span className="download-progress-label">{t("statusDownloading")} {progressPercent}%</span>
            <span className="download-progress-bytes">({formatBytes(downloadedBytes)} / {formatBytes(total)})</span>
          </div>
          <div className="download-progress-row">
            <div className="download-progress-track">
              <div className="download-progress-bar" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="download-progress-actions">
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
        <div className="download-progress download-progress-inline" onClick={(e) => e.stopPropagation()}>
          <span className="download-progress-status">{t("statusPaused")}</span>
          <span className="download-progress-bytes">({formatBytes(downloadedBytes)} / {formatBytes(total)})</span>
          <div className="download-progress-actions">
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
        <div className="download-progress-inline" onClick={(e) => e.stopPropagation()}>
          <span className="download-ready-status">
            <CheckCircle size={14} />
            <span>{t("savedStatusShort")}</span>
          </span>
          <button
            className="download-icon-button"
            onClick={handleProxyDownload}
            title={t("downloadAgainTooltip")}
            aria-label={t("downloadAgainTooltip")}
          >
            <Download size={11} />
          </button>
        </div>
      );

    case "failed":
      return (
        <div className="download-progress-inline download-error-status" onClick={(e) => e.stopPropagation()}>
          <AlertCircle size={12} />
          <span title={error || t("statusFailed")}>{t("statusFailed")}</span>
          <button className="download-link-button" onClick={handleResume}>
            {t("retryBtn")}
          </button>
        </div>
      );

    case "stopped":
      return (
        <div className="download-progress-inline" onClick={(e) => e.stopPropagation()}>
          <span className="download-progress-status">{t("statusStopped")}</span>
          <button className="download-link-button" onClick={handleResume}>
            {t("retryBtn")}
          </button>
        </div>
      );

    case "expired":
      return (
        <div className="download-progress-inline" onClick={(e) => e.stopPropagation()}>
          <span>{t("expiredStatus")}</span>
          <button className="download-link-button" onClick={handleDownload}>
            {t("refetchBtn")}
          </button>
        </div>
      );

    default:
      return null;
  }
};
