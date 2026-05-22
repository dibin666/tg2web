import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { DownloadProgress } from "../components/DownloadProgress";
import { 
  Search, 
  Filter, 
  Tag, 
  FileText, 
  Image as ImageIcon, 
  Film, 
  Music, 
  File,
  FolderOpen,
  Archive
} from "lucide-react";

type FileTypeKey = "all" | "image" | "archive" | "audio" | "video" | "document" | "other";

const FILE_TYPE_OPTIONS: Array<{ key: FileTypeKey; label: string }> = [
  { key: "all", label: "全部类型" },
  { key: "image", label: "图片" },
  { key: "archive", label: "压缩包" },
  { key: "audio", label: "音频" },
  { key: "video", label: "视频" },
  { key: "document", label: "文档" },
  { key: "other", label: "其他" },
];

const fileTypeFor = (mimeType: string, fileName: string): { key: Exclude<FileTypeKey, "all">; label: string } => {
  const mime = mimeType.toLowerCase();
  const name = fileName.toLowerCase();

  if (mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg|avif|heic)$/.test(name)) {
    return { key: "image", label: "图片" };
  }
  if (
    mime.includes("zip")
    || mime.includes("rar")
    || mime.includes("7z")
    || /\.(zip|rar|7z|tar|gz|tgz|bz2|xz)$/.test(name)
  ) {
    return { key: "archive", label: "压缩包" };
  }
  if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/.test(name)) {
    return { key: "audio", label: "音频" };
  }
  if (mime.startsWith("video/") || /\.(mp4|avi|mov|mkv|webm|m4v)$/.test(name)) {
    return { key: "video", label: "视频" };
  }
  if (
    mime.startsWith("text/")
    || mime.includes("pdf")
    || mime.includes("document")
    || mime.includes("spreadsheet")
    || /\.(txt|pdf|doc|docx|xls|xlsx|csv|json|md|epub)$/.test(name)
  ) {
    return { key: "document", label: "文档" };
  }
  return { key: "other", label: "其他" };
};

export const WorkspacePage: React.FC = () => {
  const { workspaceFiles, bots, downloads, updateFileTag, t } = useApp();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBotId, setSelectedBotId] = useState<string>("all");
  const [selectedFileType, setSelectedFileType] = useState<FileTypeKey>("all");
  
  // Track which file tag is being edited
  const [editingTagFileId, setEditingTagFileId] = useState<string | null>(null);
  const [tempTagValue, setTempTagValue] = useState("");

  // Filtered files list based on filters
  const filteredFiles = useMemo(() => {
    return workspaceFiles.filter(file => {
      // Bot filter
      if (selectedBotId !== "all" && file.botId !== selectedBotId) return false;
      const fileType = fileTypeFor(file.mimeType, file.fileName);
      if (selectedFileType !== "all" && fileType.key !== selectedFileType) return false;
      
      // Search filter (filename or tag or sender)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = file.fileName.toLowerCase().includes(query);
        const tagMatch = file.tag ? file.tag.toLowerCase().includes(query) : false;
        const senderMatch = file.senderName.toLowerCase().includes(query);
        const typeMatch = fileType.label.toLowerCase().includes(query);
        return nameMatch || tagMatch || senderMatch || typeMatch;
      }
      
      return true;
    });
  }, [workspaceFiles, selectedBotId, selectedFileType, searchQuery]);

  // Helper to format file size
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Helper to choose file type icon
  const getFileIcon = (mimeType: string, fileName: string) => {
    const mime = mimeType.toLowerCase();
    const name = fileName.toLowerCase();
    
    if (mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(name)) {
      return <ImageIcon size={20} style={{ color: "var(--accent-blue)" }} />;
    }
    if (fileTypeFor(mimeType, fileName).key === "archive") {
      return <Archive size={20} style={{ color: "var(--accent-purple, #8b5cf6)" }} />;
    }
    if (mime.startsWith("video/") || /\.(mp4|avi|mov|mkv|webm)$/.test(name)) {
      return <Film size={20} style={{ color: "var(--accent-yellow)" }} />;
    }
    if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a)$/.test(name)) {
      return <Music size={20} style={{ color: "var(--accent-green)" }} />;
    }
    if (mime.startsWith("text/") || /\.(txt|pdf|doc|docx|xls|xlsx|csv|json)$/.test(name)) {
      return <FileText size={20} style={{ color: "#ec4899" }} />;
    }
    return <File size={20} style={{ color: "var(--text-muted)" }} />;
  };

  const handleEditTagClick = (fileId: string, currentTag: string) => {
    setEditingTagFileId(fileId);
    setTempTagValue(currentTag || "");
  };

  const handleSaveTag = async (fileId: string) => {
    await updateFileTag(fileId, tempTagValue.trim());
    setEditingTagFileId(null);
  };

  const getBotTitle = (botId: string) => {
    const bot = bots.find(b => b.id === botId);
    return bot ? bot.title : `Bot [${botId}]`;
  };

  const getDownloadForFile = (fileId: string, messageId: string) =>
    downloads.find((download) => download.fileId === fileId && (download.messageId || "") === messageId)
    || downloads.find((download) => download.fileId === fileId);

  const fileCacheLabel = (fileId: string, messageId: string) => {
    const download = getDownloadForFile(fileId, messageId);
    if (!download) return "未缓存，可下载";
    if (download.status === "ready") return "服务器已缓存";
    if (download.status === "expired") return "缓存已清理，可重新下载";
    if (download.status === "downloading" || download.status === "queued") return "正在下载到服务器";
    if (download.status === "paused") return "已暂停";
    if (download.status === "failed") return "下载失败";
    if (download.status === "stopped") return "已停止";
    return download.status;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        flex: 1,
        backgroundColor: "var(--bg-app)",
        overflow: "hidden",
      }}
      className="animate-fade-in"
    >
      {/* Workspace Header */}
      <div
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--border-color)",
          backgroundColor: "var(--bg-panel)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-primary)" }}>
            {t("fileHistoryTitle")}
          </h1>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
            {t("fileHistoryDesc")}
          </p>
        </div>

        {/* Filters and search Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          {/* Search Input */}
          <div
            style={{
              position: "relative",
              flex: 1,
              minWidth: "260px",
            }}
          >
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="settings-input"
              style={{
                paddingLeft: "36px",
                fontSize: "0.85rem",
              }}
            />
          </div>

          {/* Bot Select Filter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              padding: "4px 10px",
            }}
          >
            <Filter size={14} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{t("botFilterLabel")}</span>
            <select
              value={selectedBotId}
              onChange={e => setSelectedBotId(e.target.value)}
              style={{
                fontSize: "0.8rem",
                color: "var(--text-primary)",
                fontWeight: "500",
                cursor: "pointer",
                padding: "2px 20px 2px 4px",
                backgroundColor: "transparent",
                border: "none",
                outline: "none",
              }}
            >
              <option value="all">{t("allBots")}</option>
              {bots.map(bot => (
                <option key={bot.id} value={bot.id}>
                  {bot.title}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              padding: "4px 10px",
            }}
          >
            <File size={14} style={{ color: "var(--text-secondary)" }} />
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>类型:</span>
            <select
              value={selectedFileType}
              onChange={e => setSelectedFileType(e.target.value as FileTypeKey)}
              style={{
                fontSize: "0.8rem",
                color: "var(--text-primary)",
                fontWeight: "500",
                cursor: "pointer",
                padding: "2px 20px 2px 4px",
                backgroundColor: "transparent",
                border: "none",
                outline: "none",
              }}
            >
              {FILE_TYPE_OPTIONS.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Files List Area */}
      <div
        style={{
          flex: 1,
          padding: "24px",
          overflowY: "auto",
        }}
      >
        {filteredFiles.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              minHeight: "250px",
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-panel)",
              borderRadius: "8px",
              border: "1px dashed var(--border-color)",
              padding: "32px",
              textAlign: "center",
            }}
          >
            <FolderOpen size={48} style={{ strokeWidth: 1.5, marginBottom: "12px", color: "var(--text-muted)" }} />
            <h3 style={{ fontSize: "0.95rem", fontWeight: "600", color: "var(--text-primary)" }}>
              {t("noFilesFound")}
            </h3>
            <p style={{ fontSize: "0.8rem", marginTop: "4px", maxWidth: "320px" }}>
              {t("noFilesDesc")}
            </p>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: "var(--bg-panel)",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              overflow: "hidden",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <th style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colFileName")}
                  </th>
                  <th style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colBot")}
                  </th>
                  <th style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colSender")}
                  </th>
                  <th style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colTag")}
                  </th>
                  <th style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colDate")}
                  </th>
                  <th style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc", textAlign: "right" }}>
                    {t("colDownloadStatus")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map(file => {
                  const isEditingTag = editingTagFileId === file.id;
                  const fileType = fileTypeFor(file.mimeType, file.fileName);
                  
                  return (
                    <tr 
                      key={file.id} 
                      style={{ borderBottom: "1px solid var(--border-color)", transition: "background-color 0.15s ease" }}
                      className="table-row-hover"
                    >
                      {/* File Name Column */}
                      <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                            {getFileIcon(file.mimeType, file.fileName)}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                            <span 
                              style={{ 
                                fontSize: "0.85rem", 
                                fontWeight: "600", 
                                color: "var(--text-primary)", 
                                overflow: "hidden", 
                                textOverflow: "ellipsis", 
                                whiteSpace: "nowrap", 
                                maxWidth: "240px" 
                              }} 
                              title={file.fileName}
                            >
                              {file.fileName}
                            </span>
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                              {fileType.label} · {formatBytes(file.sizeBytes)}
                            </span>
                            <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                              {fileCacheLabel(file.fileId, file.messageId)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Bot Column */}
                      <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                        <span 
                          style={{ 
                            display: "inline-block", 
                            backgroundColor: "var(--accent-blue-transparent)", 
                            color: "var(--accent-blue)", 
                            fontSize: "0.7rem", 
                            fontWeight: "600", 
                            padding: "2px 8px", 
                            borderRadius: "4px" 
                          }}
                        >
                          {getBotTitle(file.botId)}
                        </span>
                      </td>

                      {/* Sender Column */}
                      <td style={{ padding: "12px 16px", verticalAlign: "middle", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                        {file.senderName}
                      </td>

                      {/* Tag Column */}
                      <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", minHeight: "28px" }}>
                          {isEditingTag ? (
                            <div style={{ display: "flex", gap: "4px", width: "100%" }}>
                              <input
                                type="text"
                                value={tempTagValue}
                                onChange={e => setTempTagValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") handleSaveTag(file.id);
                                  if (e.key === "Escape") setEditingTagFileId(null);
                                }}
                                autoFocus
                                style={{
                                  fontSize: "0.75rem",
                                  border: "1px solid var(--accent-blue)",
                                  borderRadius: "4px",
                                  padding: "2px 6px",
                                  backgroundColor: "#ffffff",
                                  color: "var(--text-primary)",
                                  width: "100px",
                                }}
                              />
                              <button
                                onClick={() => handleSaveTag(file.id)}
                                style={{
                                  backgroundColor: "var(--accent-blue)",
                                  color: "#ffffff",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontSize: "0.7rem",
                                  cursor: "pointer",
                                }}
                              >
                                {t("saveBtn")}
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={() => handleEditTagClick(file.id, file.tag || "")}
                              style={{
                                fontSize: "0.75rem",
                                color: file.tag ? "var(--accent-blue)" : "var(--text-secondary)",
                                backgroundColor: file.tag ? "var(--accent-blue-transparent)" : "rgba(0,0,0,0.02)",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontWeight: "600",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                width: "fit-content",
                              }}
                              title="Click to edit tag"
                            >
                              <Tag size={10} style={{ opacity: 0.6 }} />
                              <span>{file.tag || t("addTag")}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Date Column */}
                      <td style={{ padding: "12px 16px", verticalAlign: "middle", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                        {new Date(file.receivedAt).toLocaleDateString()}
                      </td>

                      {/* Download Status Column */}
                      <td style={{ padding: "12px 16px", verticalAlign: "middle", textAlign: "right" }}>
                        <div style={{ display: "inline-block", textAlign: "left" }} onClick={e => e.stopPropagation()}>
                          <DownloadProgress
                            fileId={file.fileId}
                            fileName={file.fileName}
                            sizeBytes={file.sizeBytes}
                            messageId={file.messageId}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .table-row-hover:hover td {
          background-color: #f8fafc !important;
        }
      `}</style>
    </div>
  );
};
