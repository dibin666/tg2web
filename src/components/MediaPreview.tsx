import React from "react";
import { MessageMedia } from "../api/types";
import { DownloadProgress } from "./DownloadProgress";
import { FileText, Play, Music, Mic, FileQuestion, MapPin } from "lucide-react";

interface MediaPreviewProps {
  media: MessageMedia;
  messageId: string;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({ media, messageId }) => {
  switch (media.kind) {
    case "photo":
      return (
        <div className="media-preview-container">
          {media.thumbnailUrl && (
            <img src={media.thumbnailUrl} alt="Photo attachment" className="media-image" />
          )}
          <div style={{ padding: "8px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end" }}>
            <DownloadProgress
              fileId={media.fileId}
              fileName="telegram_photo.jpg"
              sizeBytes={250 * 1024} // mock size
              messageId={messageId}
            />
          </div>
        </div>
      );

    case "video":
      return (
        <div className="media-preview-container">
          <div style={{ position: "relative" }}>
            {media.thumbnailUrl ? (
              <img src={media.thumbnailUrl} alt="Video thumbnail" className="media-image" style={{ filter: "brightness(0.7)" }} />
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
          <div style={{ padding: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Video file</span>
            <DownloadProgress
              fileId={media.fileId}
              fileName="telegram_video.mp4"
              sizeBytes={1024 * 1024 * 18} // mock 18MB
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
          <DownloadProgress
            fileId={media.fileId}
            fileName={media.title ? `${media.title}.mp3` : "audio.mp3"}
            sizeBytes={1024 * 1024 * 4}
            messageId={messageId}
          />
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
              sizeBytes={1024 * 128} // mock size 128KB
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
          <DownloadProgress
            fileId={media.fileId}
            fileName={media.fileName}
            sizeBytes={media.sizeBytes}
            messageId={messageId}
          />
        </div>
      );

    case "sticker":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", margin: "6px 0" }}>
          {media.thumbnailUrl ? (
            <img
              src={media.thumbnailUrl}
              alt="Sticker"
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
              <img
                src={media.thumbnailUrl}
                alt="Animation/GIF"
                className="media-image animate-pulse-slow"
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
          <div style={{ padding: "8px", display: "flex", justifyContent: "flex-end" }}>
            <DownloadProgress
              fileId={media.fileId}
              fileName="animation.gif"
              sizeBytes={1024 * 1024 * 2} // mock 2MB
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
            <DownloadProgress
              fileId={media.fileId}
              fileName="unknown_media"
              sizeBytes={1024}
              messageId={messageId}
            />
          )}
        </div>
      );
  }
};
