import React from "react";
import { useApp } from "../context/AppContext";
import { downloadProxyFile, type ProxyDownloadProgress } from "../api/client";
import { Download, AlertCircle, Loader, Pause, Play, Square, RefreshCw } from "lucide-react";

interface DownloadProgressProps {
  fileId: string;
  fileName?: string;
  sizeBytes?: number;
  messageId?: string;
  compact?: boolean;
  hideControls?: boolean;
}

export const DownloadProgress: React.FC<DownloadProgressProps> = ({ fileId, fileName, sizeBytes, messageId, compact, hideControls }) => {
  const { downloads, downloadMedia, pauseDownload, resumeDownload, stopDownload, t } = useApp();
  const [localDownloadProgress, setLocalDownloadProgress] = React.useState<ProxyDownloadProgress | null>(null);

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
    if (localDownloadProgress) return;

    if (!activeDownload?.proxyUrl) {
      handleDownload();
      return;
    }

    setLocalDownloadProgress({
      loadedBytes: 0,
      totalBytes: sizeBytes || activeDownload.sizeBytes,
      percent: 0,
    });

    try {
      await downloadProxyFile(activeDownload.proxyUrl, activeDownload.fileName || fileName, setLocalDownloadProgress);
    } catch (error) {
      console.error("Proxy download failed", error);
    } finally {
      setLocalDownloadProgress(null);
    }
  };

  if (!activeDownload) {
    if (compact) {
      return (
        <button className="icon-action-button start" onClick={(e) => { e.stopPropagation(); handleDownload(); }} title={`${t("downloadBtn")} (${formatBytes(sizeBytes)})`}>
          <Download size={14} />
        </button>
      );
    }
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
      if (compact) {
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
            <span title={t("statusPreparing")} style={{ display: "inline-flex" }}>
              <Loader size={12} className="animate-spin" style={{ color: "var(--accent-blue)" }} />
            </span>
            <button className="icon-action-button primary" onClick={(e) => { e.stopPropagation(); handlePause(); }} title={t("pauseBtn")} style={{ width: "24px", height: "24px" }}>
              <Pause size={12} />
            </button>
            <button className="icon-action-button danger" onClick={(e) => { e.stopPropagation(); handleStop(); }} title={t("stopBtn")} style={{ width: "24px", height: "24px" }}>
              <Square size={10} />
            </button>
          </div>
        );
      }
      return (
        <div className="download-progress-container-inline" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="status-pill downloading">
            <Loader size={12} className="animate-pulse-slow" />
            <span>{t("statusPreparing")}</span>
          </span>
          {!hideControls && (
            <div className="download-progress-actions" style={{ display: "flex", gap: "4px" }}>
              <button className="download-icon-button" onClick={handlePause} title={t("pauseBtn")} aria-label={t("pauseBtn")}>
                <Pause size={12} />
              </button>
              <button className="download-icon-button danger" onClick={handleStop} title={t("stopBtn")} aria-label={t("stopBtn")}>
                <Square size={11} />
              </button>
            </div>
          )}
        </div>
      );

    case "downloading":
      if (compact) {
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
            <span title={`${t("statusDownloading")} ${progressPercent}%`} style={{ display: "inline-flex" }}>
              <Loader size={12} className="animate-spin" style={{ color: "var(--accent-blue)" }} />
            </span>
            <button className="icon-action-button primary" onClick={(e) => { e.stopPropagation(); handlePause(); }} title={t("pauseBtn")} style={{ width: "24px", height: "24px" }}>
              <Pause size={12} />
            </button>
            <button className="icon-action-button danger" onClick={(e) => { e.stopPropagation(); handleStop(); }} title={t("stopBtn")} style={{ width: "24px", height: "24px" }}>
              <Square size={10} />
            </button>
          </div>
        );
      }
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
            {!hideControls && (
              <div className="download-progress-actions" style={{ display: "flex", gap: "4px" }}>
                <button className="download-icon-button" onClick={handlePause} title={t("pauseBtn")} aria-label={t("pauseBtn")}>
                  <Pause size={12} />
                </button>
                <button className="download-icon-button danger" onClick={handleStop} title={t("stopBtn")} aria-label={t("stopBtn")}>
                  <Square size={11} />
                </button>
              </div>
            )}
          </div>
        </div>
      );

    case "paused":
      if (compact) {
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
            <span title={`${t("statusPaused")} (${progressPercent}%)`} style={{ display: "inline-flex" }}>
              <Pause size={12} style={{ color: "var(--text-muted)" }} />
            </span>
            <button className="icon-action-button primary" onClick={(e) => { e.stopPropagation(); handleResume(); }} title={t("resumeBtn")} style={{ width: "24px", height: "24px" }}>
              <Play size={12} />
            </button>
            <button className="icon-action-button danger" onClick={(e) => { e.stopPropagation(); handleStop(); }} title={t("stopBtn")} style={{ width: "24px", height: "24px" }}>
              <Square size={10} />
            </button>
          </div>
        );
      }
      return (
        <div className="download-progress-container-inline" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="status-pill paused">
            <Pause size={11} />
            <span>{t("statusPaused")} ({progressPercent}%)</span>
          </span>
          {!hideControls && (
            <div className="download-progress-actions" style={{ display: "flex", gap: "4px" }}>
              <button className="download-icon-button" onClick={handleResume} title={t("resumeBtn")} aria-label={t("resumeBtn")}>
                <Play size={12} />
              </button>
              <button className="download-icon-button danger" onClick={handleStop} title={t("stopBtn")} aria-label={t("stopBtn")}>
                <Square size={11} />
              </button>
            </div>
          )}
        </div>
      );

    case "ready":
      {
        const isLocalDownloadActive = Boolean(localDownloadProgress);
        const localDownloadLabel = isLocalDownloadActive
          ? localDownloadProgress?.percent
            ? `准备中 ${localDownloadProgress.percent}%`
            : t("statusPreparing")
          : "下载到本机";

        if (compact) {
          return (
            <button
              className="icon-action-button success"
              onClick={(e) => { e.stopPropagation(); handleProxyDownload(); }}
              title={isLocalDownloadActive ? localDownloadLabel : "下载到本机"}
              disabled={isLocalDownloadActive}
              aria-busy={isLocalDownloadActive}
            >
              {isLocalDownloadActive ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
            </button>
          );
        }

        return (
          <button
            className="btn-download-action success"
            onClick={handleProxyDownload}
            title={t("downloadAgainTooltip")}
            disabled={isLocalDownloadActive}
            aria-busy={isLocalDownloadActive}
            style={{ cursor: isLocalDownloadActive ? "wait" : "pointer" }}
          >
            {isLocalDownloadActive ? <Loader size={12} className="animate-pulse-slow" /> : <Download size={12} />}
            <span>{localDownloadLabel}</span>
          </button>
        );
      }

    case "failed":
      if (compact) {
        return (
          <button className="icon-action-button danger" onClick={(e) => { e.stopPropagation(); handleResume(); }} title={`${t("statusFailed")} - ${t("retryBtn")}`}>
            <RefreshCw size={14} />
          </button>
        );
      }
      if (hideControls) {
        return (
          <div className="download-progress-container-inline" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center" }}>
            <span className="status-pill failed" title={error || t("statusFailed")}>
              <AlertCircle size={11} />
              <span>{t("statusFailed")}</span>
            </span>
          </div>
        );
      }
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
      if (compact) {
        return (
          <button className="icon-action-button danger" onClick={(e) => { e.stopPropagation(); handleResume(); }} title={`${t("statusStopped")} - ${t("retryBtn")}`}>
            <RefreshCw size={14} />
          </button>
        );
      }
      if (hideControls) {
        return (
          <div className="download-progress-container-inline" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center" }}>
            <span className="status-pill failed">
              <Square size={11} />
              <span>{t("statusStopped")}</span>
            </span>
          </div>
        );
      }
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
      if (compact) {
        return (
          <button className="icon-action-button expired" onClick={(e) => { e.stopPropagation(); handleDownload(); }} title={`${t("expiredStatus")} - ${t("refetchBtn")}`}>
            <Download size={14} />
          </button>
        );
      }
      return (
        <div className="download-progress-container-inline" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="status-pill expired">
            <AlertCircle size={11} />
            <span>{t("expiredStatus")}</span>
          </span>
          {!hideControls && (
            <button className="btn-download-action expired" onClick={handleDownload}>
              <Download size={10} />
              <span>{t("refetchBtn")}</span>
            </button>
          )}
        </div>
      );

    default:
      return null;
  }
};
