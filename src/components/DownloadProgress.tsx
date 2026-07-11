import React from "react";
import { useApp } from "../context/AppContext";
import { downloadProxyFile, type ProxyDownloadProgress } from "../api/client";
import { Download, AlertCircle, Loader2, Pause, Play, Square, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface DownloadProgressProps {
  fileId: string;
  fileName?: string;
  sizeBytes?: number;
  messageId?: string;
  compact?: boolean;
  hideControls?: boolean;
}

const formatBytes = (bytes?: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/* Small round icon action shared by all states */
const IconAction: React.FC<{
  onClick: (e: React.MouseEvent) => void;
  title: string;
  tone?: "default" | "danger" | "primary" | "success";
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, tone = "default", disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={cn(
      "inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
      tone === "default" && "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      tone === "primary" && "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
      tone === "danger" && "border-destructive/30 text-destructive hover:bg-destructive/10",
      tone === "success" && "border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[var(--success-soft)] text-success hover:brightness-95"
    )}
  >
    {children}
  </button>
);

const StatusPill: React.FC<{ tone: "primary" | "warning" | "danger" | "muted"; children: React.ReactNode; title?: string }> = ({
  tone,
  children,
  title,
}) => (
  <span
    title={title}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
      tone === "primary" && "bg-primary/10 text-primary",
      tone === "warning" && "bg-[var(--warning-soft)] text-warning",
      tone === "danger" && "bg-[var(--danger-soft)] text-destructive",
      tone === "muted" && "bg-muted text-muted-foreground"
    )}
  >
    {children}
  </span>
);

export const DownloadProgress: React.FC<DownloadProgressProps> = ({
  fileId,
  fileName,
  sizeBytes,
  messageId,
  compact,
  hideControls,
}) => {
  const { downloads, downloadMedia, pauseDownload, resumeDownload, stopDownload, t } = useApp();
  const [localDownloadProgress, setLocalDownloadProgress] = React.useState<ProxyDownloadProgress | null>(null);

  const activeDownload =
    downloads.find((d) => d.fileId === fileId && (d.messageId || "") === (messageId || "")) ||
    downloads.find((d) => d.fileId === fileId);

  const handleDownload = () => {
    downloadMedia(fileId, messageId, fileName, sizeBytes);
  };

  const handlePause = () => activeDownload && void pauseDownload(activeDownload.id);
  const handleResume = () => activeDownload && void resumeDownload(activeDownload.id);
  const handleStop = () => activeDownload && void stopDownload(activeDownload.id);

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
        <IconAction
          tone="primary"
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
          title={`${t("downloadBtn")} (${formatBytes(sizeBytes)})`}
        >
          <Download className="size-3.5" />
        </IconAction>
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDownload();
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
      >
        <Download className="size-3" />
        <span>
          {t("downloadBtn")} ({formatBytes(sizeBytes)})
        </span>
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
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Loader2 className="size-3 animate-spin text-primary" aria-label={t("statusPreparing")} />
            <IconAction tone="primary" onClick={handlePause} title={t("pauseBtn")}>
              <Pause className="size-3" />
            </IconAction>
            <IconAction tone="danger" onClick={handleStop} title={t("stopBtn")}>
              <Square className="size-2.5" />
            </IconAction>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <StatusPill tone="primary">
            <Loader2 className="size-3 animate-spin" />
            <span>{t("statusPreparing")}</span>
          </StatusPill>
          {!hideControls && (
            <div className="flex gap-1">
              <IconAction onClick={handlePause} title={t("pauseBtn")}>
                <Pause className="size-3" />
              </IconAction>
              <IconAction tone="danger" onClick={handleStop} title={t("stopBtn")}>
                <Square className="size-2.5" />
              </IconAction>
            </div>
          )}
        </div>
      );

    case "downloading":
      if (compact) {
        return (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Loader2 className="size-3 animate-spin text-primary" aria-label={`${t("statusDownloading")} ${progressPercent}%`} />
            <IconAction tone="primary" onClick={handlePause} title={t("pauseBtn")}>
              <Pause className="size-3" />
            </IconAction>
            <IconAction tone="danger" onClick={handleStop} title={t("stopBtn")}>
              <Square className="size-2.5" />
            </IconAction>
          </div>
        );
      }
      return (
        <div className="flex min-w-40 flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-primary">
              {t("statusDownloading")} {progressPercent}%
            </span>
            <span className="text-muted-foreground">
              {formatBytes(downloadedBytes)} / {formatBytes(total)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Progress value={progressPercent} className="h-1.5 flex-1" />
            {!hideControls && (
              <div className="flex gap-1">
                <IconAction onClick={handlePause} title={t("pauseBtn")}>
                  <Pause className="size-3" />
                </IconAction>
                <IconAction tone="danger" onClick={handleStop} title={t("stopBtn")}>
                  <Square className="size-2.5" />
                </IconAction>
              </div>
            )}
          </div>
        </div>
      );

    case "paused":
      if (compact) {
        return (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Pause className="size-3 text-muted-foreground" aria-label={`${t("statusPaused")} (${progressPercent}%)`} />
            <IconAction tone="primary" onClick={handleResume} title={t("resumeBtn")}>
              <Play className="size-3" />
            </IconAction>
            <IconAction tone="danger" onClick={handleStop} title={t("stopBtn")}>
              <Square className="size-2.5" />
            </IconAction>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <StatusPill tone="warning">
            <Pause className="size-3" />
            <span>
              {t("statusPaused")} ({progressPercent}%)
            </span>
          </StatusPill>
          {!hideControls && (
            <div className="flex gap-1">
              <IconAction onClick={handleResume} title={t("resumeBtn")}>
                <Play className="size-3" />
              </IconAction>
              <IconAction tone="danger" onClick={handleStop} title={t("stopBtn")}>
                <Square className="size-2.5" />
              </IconAction>
            </div>
          )}
        </div>
      );

    case "ready": {
      const isLocalDownloadActive = Boolean(localDownloadProgress);
      const localDownloadLabel = isLocalDownloadActive
        ? localDownloadProgress?.percent
          ? `准备中 ${localDownloadProgress.percent}%`
          : t("statusPreparing")
        : "下载到本机";

      if (compact) {
        return (
          <IconAction
            tone="success"
            onClick={(e) => {
              e.stopPropagation();
              handleProxyDownload();
            }}
            title={localDownloadLabel}
            disabled={isLocalDownloadActive}
          >
            {isLocalDownloadActive ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          </IconAction>
        );
      }

      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleProxyDownload();
          }}
          disabled={isLocalDownloadActive}
          aria-busy={isLocalDownloadActive}
          title={t("downloadAgainTooltip")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
            "border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[var(--success-soft)] text-success hover:brightness-95",
            isLocalDownloadActive && "cursor-wait opacity-70"
          )}
        >
          {isLocalDownloadActive ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
          <span>{localDownloadLabel}</span>
        </button>
      );
    }

    case "failed":
      if (compact) {
        return (
          <IconAction
            tone="danger"
            onClick={(e) => {
              e.stopPropagation();
              handleResume();
            }}
            title={`${t("statusFailed")} - ${t("retryBtn")}`}
          >
            <RefreshCw className="size-3.5" />
          </IconAction>
        );
      }
      return (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <StatusPill tone="danger" title={error || t("statusFailed")}>
            <AlertCircle className="size-3" />
            <span>{t("statusFailed")}</span>
          </StatusPill>
          {!hideControls && (
            <IconAction tone="danger" onClick={handleResume} title={t("retryBtn")}>
              <Play className="size-3" />
            </IconAction>
          )}
        </div>
      );

    case "stopped":
      if (compact) {
        return (
          <IconAction
            tone="danger"
            onClick={(e) => {
              e.stopPropagation();
              handleResume();
            }}
            title={`${t("statusStopped")} - ${t("retryBtn")}`}
          >
            <RefreshCw className="size-3.5" />
          </IconAction>
        );
      }
      return (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <StatusPill tone="danger">
            <Square className="size-2.5" />
            <span>{t("statusStopped")}</span>
          </StatusPill>
          {!hideControls && (
            <IconAction tone="danger" onClick={handleResume} title={t("retryBtn")}>
              <Play className="size-3" />
            </IconAction>
          )}
        </div>
      );

    case "expired":
      if (compact) {
        return (
          <IconAction
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            title={`${t("expiredStatus")} - ${t("refetchBtn")}`}
          >
            <Download className="size-3.5" />
          </IconAction>
        );
      }
      return (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <StatusPill tone="muted">
            <AlertCircle className="size-3" />
            <span>{t("expiredStatus")}</span>
          </StatusPill>
          {!hideControls && (
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Download className="size-3" />
              <span>{t("refetchBtn")}</span>
            </button>
          )}
        </div>
      );

    default:
      return null;
  }
};
