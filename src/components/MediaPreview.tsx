import React from "react";
import { MessageMedia } from "../api/types";
import { DownloadProgress } from "./DownloadProgress";
import { proxyFileObjectUrl, proxyPathForFile } from "../api/client";
import { FileText, Play, Music, Mic, FileQuestion, MapPin } from "lucide-react";
import { useApp } from "../context/AppContext";

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

  return <div className="media-image-placeholder">{failed && !isPreparing ? "Preview unavailable" : "Loading preview..."}</div>;
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

export const MediaPreview: React.FC<MediaPreviewProps> = ({ media, messageId }) => {
  const { downloads, downloadMedia } = useApp();
  const previewSource = "thumbnailUrl" in media ? media.thumbnailUrl : undefined;
  const previewFileId = media.kind === "photo"
    ? media.fileId
    : proxyFileIdFromPath(previewSource);
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
        <div className="media-photo-preview">
          <AuthenticatedMediaImage
            src={media.thumbnailUrl || proxyPathForFile(media.fileId)}
            alt="Photo attachment"
            className="media-image"
            reloadKey={reloadKey}
            isPreparing={previewIsPreparing}
          />
        </div>
      );

    case "video":
      return (
        <div className="media-preview-container">
          <div style={{ position: "relative" }}>
            {media.thumbnailUrl ? (
              <AuthenticatedMediaImage src={media.thumbnailUrl} alt="Video thumbnail" className="media-image" reloadKey={reloadKey} isPreparing={previewIsPreparing} style={{ filter: "brightness(0.7)" }} />
            ) : (
              <div style={{ height: "150px", backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center" }} />
            )}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ backgroundColor: "rgba(0,0,0,0.6)", padding: "10px", borderRadius: "50%", color: "#fff" }}>
                <Play size={24} fill="#fff" />
              </div>
            </div>
            {media.durationSec && (
              <div style={{ position: "absolute", bottom: "8px", right: "8px", backgroundColor: "rgba(0,0,0,0.8)", padding: "2px 6px", borderRadius: "4px", fontSize: "0.7rem" }}>
                {Math.floor(media.durationSec / 60)}:{(media.durationSec % 60).toString().padStart(2, "0")}
              </div>
            )}
          </div>
          <div className="media-footer-download" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Video file</span>
            <DownloadProgress
              fileId={media.fileId}
              fileName="telegram_video.mp4"
              messageId={messageId}
            />
          </div>
        </div>
      );

    case "audio":
      return (
        <div className="media-preview-container media-file-card">
          <div style={{ backgroundColor: "var(--accent-blue-transparent)", padding: "8px", borderRadius: "6px", color: "var(--accent-blue-hover)" }}>
            <Music size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: "600", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
              {media.title || "Unknown Audio"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {media.performer || "Unknown Performer"} {media.durationSec ? `(${Math.floor(media.durationSec / 60)}:${(media.durationSec % 60).toString().padStart(2, "0")})` : ""}
            </div>
          </div>
          <div className="media-download-slot">
            <DownloadProgress
              fileId={media.fileId}
              fileName={media.title ? `${media.title}.mp3` : "audio.mp3"}
              sizeBytes={1024 * 1024 * 4}
              messageId={messageId}
            />
          </div>
        </div>
      );

    case "voice":
      return (
        <div className="media-preview-container media-audio-card">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ backgroundColor: "var(--accent-green-transparent)", padding: "6px", borderRadius: "50%", color: "var(--accent-green)" }}>
              <Mic size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                Voice note {media.durationSec ? `(${media.durationSec}s)` : ""}
              </div>
              {media.waveform && (
                <div className="media-waveform">
                  {media.waveform.slice(0, 24).map((h, i) => (
                    <div
                      key={i}
                      className="waveform-bar"
                      style={{
                        height: `${Math.max(10, Math.min(100, h))}%`,
                        opacity: 0.6,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
            <DownloadProgress
              fileId={media.fileId}
              fileName="voice_note.ogg"
              messageId={messageId}
            />
          </div>
        </div>
      );

    case "document":
      return (
        <div className="media-preview-container media-file-card">
          <div style={{ backgroundColor: "rgba(255,255,255,0.05)", padding: "8px", borderRadius: "6px", color: "var(--text-secondary)" }}>
            <FileText size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: "500", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={media.fileName}>
              {media.fileName || "document.bin"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {media.mimeType || "application/octet-stream"}
            </div>
          </div>
          <div className="media-download-slot">
            <DownloadProgress
              fileId={media.fileId}
              fileName={media.fileName}
              sizeBytes={media.sizeBytes}
              messageId={messageId}
            />
          </div>
        </div>
      );

    case "sticker":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", margin: "6px 0" }}>
          {media.thumbnailUrl ? (
            <AuthenticatedMediaImage
              src={media.thumbnailUrl}
              alt="Sticker"
              reloadKey={reloadKey}
              isPreparing={previewIsPreparing}
              style={{ width: "128px", height: "128px", objectFit: "contain" }}
            />
          ) : (
            <span style={{ fontSize: "2rem" }}>{media.emoji || "👍"}</span>
          )}
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic" }}>
            Sticker {media.emoji}
          </span>
        </div>
      );

    case "animation":
      return (
        <div className="media-preview-container">
          <div style={{ position: "relative" }}>
            {media.thumbnailUrl && (
              <AuthenticatedMediaImage
                src={media.thumbnailUrl}
                alt="Animation/GIF"
                className="media-image animate-pulse-slow"
                reloadKey={reloadKey}
                isPreparing={previewIsPreparing}
                style={{ filter: "brightness(0.9)" }}
              />
            )}
            <span
              style={{
                position: "absolute",
                top: "8px",
                left: "8px",
                backgroundColor: "rgba(0,0,0,0.8)",
                padding: "2px 6px",
                borderRadius: "4px",
                fontSize: "0.65rem",
                fontWeight: "bold",
                letterSpacing: "0.05em",
              }}
            >
              GIF
            </span>
          </div>
          <div className="media-footer-download">
            <DownloadProgress
              fileId={media.fileId}
              fileName="animation.gif"
              messageId={messageId}
            />
          </div>
        </div>
      );

    case "location":
      return (
        <div className="media-preview-container" style={{ padding: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ backgroundColor: "var(--accent-red-transparent)", padding: "8px", borderRadius: "50%", color: "var(--accent-red)" }}>
            <MapPin size={20} />
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: "600" }}>Location Shared</div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${media.latitude},${media.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "0.75rem", color: "var(--accent-blue-hover)", textDecoration: "underline" }}
            >
              View on Google Maps ({media.latitude.toFixed(4)}, {media.longitude.toFixed(4)})
            </a>
          </div>
        </div>
      );

    default:
      return (
        <div className="media-preview-container media-file-card">
          <div style={{ backgroundColor: "rgba(255, 255, 255, 0.05)", padding: "8px", borderRadius: "6px" }}>
            <FileQuestion size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: "500" }}>{media.label || "Unknown Media Type"}</div>
          </div>
          {media.fileId && (
            <div className="media-download-slot">
              <DownloadProgress
                fileId={media.fileId}
                fileName="unknown_media"
                sizeBytes={1024}
                messageId={messageId}
              />
            </div>
          )}
        </div>
      );
  }
};
