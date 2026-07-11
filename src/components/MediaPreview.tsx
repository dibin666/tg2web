import React from "react";
import { MessageMedia } from "../api/types";
import { DownloadProgress } from "./DownloadProgress";
import { proxyFileObjectUrl, proxyPathForFile } from "../api/client";
import { FileText, Play, Music, Mic, FileQuestion, MapPin, ImageOff } from "lucide-react";
import { useApp } from "../context/AppContext";
import { cn } from "@/lib/utils";

interface MediaPreviewProps {
  media: MessageMedia;
  messageId: string;
}

const AuthenticatedMediaImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
  reloadKey?: string;
  style?: React.CSSProperties;
  isPreparing?: boolean;
}> = ({ src, alt, className, reloadKey, style, isPreparing }) => {
  const [imageState, setImageState] = React.useState<{
    key: string;
    objectUrl: string | null;
    failed: boolean;
  }>({ key: "", objectUrl: null, failed: false });

  React.useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    const key = `${src}:${reloadKey || ""}`;

    void proxyFileObjectUrl(src)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setImageState({ key, objectUrl: url, failed: false });
      })
      .catch(() => {
        if (!cancelled) setImageState({ key, objectUrl: null, failed: true });
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src, reloadKey]);

  const currentKey = `${src}:${reloadKey || ""}`;
  const objectUrl = imageState.key === currentKey ? imageState.objectUrl : null;
  const failed = imageState.key === currentKey && imageState.failed;

  if (objectUrl) {
    return <img src={objectUrl} alt={alt} className={className} style={style} />;
  }

  return (
    <div
      className={cn(
        "flex h-36 w-full items-center justify-center gap-2 rounded-lg bg-muted text-xs text-muted-foreground",
        !failed && "animate-pulse"
      )}
    >
      {failed && !isPreparing ? (
        <>
          <ImageOff className="size-3.5" />
          <span>预览不可用</span>
        </>
      ) : (
        <span>正在加载预览...</span>
      )}
    </div>
  );
};

const proxyFileIdFromPath = (path?: string) => {
  if (!path) return undefined;
  const marker = "/api/files/";
  const start = path.indexOf(marker);
  const end = path.indexOf("/proxy", start + marker.length);
  if (start === -1 || end === -1) return undefined;
  return decodeURIComponent(path.slice(start + marker.length, end));
};

const isTdlibFileId = (fileId?: string) => Boolean(fileId && /^-?\d+$/.test(fileId));

const formatDuration = (durationSec?: number) =>
  durationSec !== undefined
    ? `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, "0")}`
    : undefined;

/* Shared card wrapper for file-like media */
const MediaCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn("w-full min-w-56 rounded-xl border bg-background/60 p-2.5 dark:bg-background/30", className)}>
    {children}
  </div>
);

const IconTile: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", className)}>{children}</div>
);

export const MediaPreview: React.FC<MediaPreviewProps> = ({ media, messageId }) => {
  const { downloads, downloadMedia } = useApp();
  const previewSource = "thumbnailUrl" in media ? media.thumbnailUrl : undefined;
  const previewFileId = media.kind === "photo" ? media.fileId : proxyFileIdFromPath(previewSource);
  const previewDownload = previewFileId
    ? downloads.find((item) => item.fileId === previewFileId && (item.messageId || "") === messageId)
    : undefined;
  const previewIsPreparing = previewDownload?.status === "queued" || previewDownload?.status === "downloading";
  const reloadKey = previewDownload ? previewDownload.status : undefined;
  const autoPreviewRequestedRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const shouldRequestPreview =
      !previewDownload || previewDownload.status === "expired" || previewDownload.status === "failed";
    if (!previewFileId || !isTdlibFileId(previewFileId) || !shouldRequestPreview) return;
    const requestKey = `${messageId}:${previewFileId}:${previewDownload?.status || "missing"}`;
    if (autoPreviewRequestedRef.current.has(requestKey)) return;
    autoPreviewRequestedRef.current.add(requestKey);
    void downloadMedia(previewFileId, messageId, "telegram-preview.jpg");
  }, [downloadMedia, messageId, previewDownload, previewFileId]);

  switch (media.kind) {
    case "photo":
      return (
        <div className="max-w-xs overflow-hidden rounded-xl border">
          <AuthenticatedMediaImage
            src={media.thumbnailUrl || proxyPathForFile(media.fileId)}
            alt="Photo attachment"
            className="block h-auto w-full"
            reloadKey={reloadKey}
            isPreparing={previewIsPreparing}
          />
        </div>
      );

    case "video":
      return (
        <MediaCard className="max-w-xs p-0">
          <div className="relative overflow-hidden rounded-t-xl">
            {media.thumbnailUrl ? (
              <AuthenticatedMediaImage
                src={media.thumbnailUrl}
                alt="Video thumbnail"
                className="block h-auto w-full brightness-75"
                reloadKey={reloadKey}
                isPreparing={previewIsPreparing}
              />
            ) : (
              <div className="h-36 w-full bg-foreground/90" />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="glass-panel flex size-11 items-center justify-center rounded-full text-foreground">
                <Play className="size-5 fill-current" />
              </div>
            </div>
            {media.durationSec !== undefined && (
              <span className="absolute bottom-2 right-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-medium text-white">
                {formatDuration(media.durationSec)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 p-2.5">
            <span className="text-xs text-muted-foreground">视频文件</span>
            <DownloadProgress fileId={media.fileId} fileName="telegram_video.mp4" messageId={messageId} />
          </div>
        </MediaCard>
      );

    case "audio":
      return (
        <MediaCard>
          <div className="flex items-center gap-3">
            <IconTile className="bg-primary/10 text-primary">
              <Music className="size-5" />
            </IconTile>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{media.title || "未知音频"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {media.performer || "未知艺人"}
                {media.durationSec ? ` · ${formatDuration(media.durationSec)}` : ""}
              </div>
            </div>
            <DownloadProgress
              fileId={media.fileId}
              fileName={media.title ? `${media.title}.mp3` : "audio.mp3"}
              sizeBytes={1024 * 1024 * 4}
              messageId={messageId}
            />
          </div>
        </MediaCard>
      );

    case "voice":
      return (
        <MediaCard>
          <div className="flex items-center gap-3">
            <IconTile className="rounded-full bg-[var(--success-soft)] text-success">
              <Mic className="size-4" />
            </IconTile>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground">
                语音消息{media.durationSec ? ` (${media.durationSec}s)` : ""}
              </div>
              {media.waveform && (
                <div className="mt-1 flex h-5 items-center gap-0.5 text-success">
                  {media.waveform.slice(0, 24).map((h, i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full bg-current opacity-60"
                      style={{ height: `${Math.max(12, Math.min(100, h))}%` }}
                    />
                  ))}
                </div>
              )}
            </div>
            <DownloadProgress fileId={media.fileId} fileName="voice_note.ogg" messageId={messageId} />
          </div>
        </MediaCard>
      );

    case "document":
      return (
        <MediaCard>
          <div className="flex items-center gap-3">
            <IconTile className="bg-muted text-muted-foreground">
              <FileText className="size-5" />
            </IconTile>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" title={media.fileName}>
                {media.fileName || "document.bin"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {media.mimeType || "application/octet-stream"}
              </div>
            </div>
            <DownloadProgress
              fileId={media.fileId}
              fileName={media.fileName}
              sizeBytes={media.sizeBytes}
              messageId={messageId}
            />
          </div>
        </MediaCard>
      );

    case "sticker":
      return (
        <div className="my-1 flex flex-col gap-1">
          {media.thumbnailUrl ? (
            <AuthenticatedMediaImage
              src={media.thumbnailUrl}
              alt="Sticker"
              reloadKey={reloadKey}
              isPreparing={previewIsPreparing}
              className="size-32 object-contain"
            />
          ) : (
            <span className="text-4xl">{media.emoji || "👍"}</span>
          )}
          <span className="text-[11px] italic text-muted-foreground">贴纸 {media.emoji}</span>
        </div>
      );

    case "animation":
      return (
        <MediaCard className="max-w-xs p-0">
          <div className="relative overflow-hidden rounded-t-xl">
            {media.thumbnailUrl && (
              <AuthenticatedMediaImage
                src={media.thumbnailUrl}
                alt="Animation/GIF"
                className="block h-auto w-full"
                reloadKey={reloadKey}
                isPreparing={previewIsPreparing}
              />
            )}
            <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">
              GIF
            </span>
          </div>
          <div className="flex justify-end p-2.5">
            <DownloadProgress fileId={media.fileId} fileName="animation.gif" messageId={messageId} />
          </div>
        </MediaCard>
      );

    case "location":
      return (
        <MediaCard>
          <div className="flex items-center gap-3">
            <IconTile className="rounded-full bg-[var(--danger-soft)] text-destructive">
              <MapPin className="size-5" />
            </IconTile>
            <div className="min-w-0">
              <div className="text-sm font-semibold">位置共享</div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${media.latitude},${media.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline underline-offset-2"
                onClick={(e) => e.stopPropagation()}
              >
                在 Google 地图查看 ({media.latitude.toFixed(4)}, {media.longitude.toFixed(4)})
              </a>
            </div>
          </div>
        </MediaCard>
      );

    default:
      return (
        <MediaCard>
          <div className="flex items-center gap-3">
            <IconTile className="bg-muted text-muted-foreground">
              <FileQuestion className="size-5" />
            </IconTile>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{media.label || "未知媒体类型"}</div>
            </div>
            {media.fileId && (
              <DownloadProgress fileId={media.fileId} fileName="unknown_media" sizeBytes={1024} messageId={messageId} />
            )}
          </div>
        </MediaCard>
      );
  }
};
