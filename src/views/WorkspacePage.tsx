import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { downloadProxyFile } from "../api/client";
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
  Archive,
  Download,
  Loader
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

const getFileTypeIconComponent = (key: FileTypeKey) => {
  switch (key) {
    case "all": return FolderOpen;
    case "image": return ImageIcon;
    case "archive": return Archive;
    case "audio": return Music;
    case "video": return Film;
    case "document": return FileText;
    default: return File;
  }
};

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
  const { workspaceFiles, bots, updateFileTag, t, downloads, downloadMedia } = useApp();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBotId, setSelectedBotId] = useState<string>("all");
  const [selectedFileType, setSelectedFileType] = useState<FileTypeKey>("all");
  
  // Multi-select state
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  
  // Track files queued for automatic local browser download once ready on the server
  const pendingLocalDownloadsRef = React.useRef<Set<string>>(new Set());

  // Effect to automatically trigger local browser download when a queued file becomes ready on the server
  React.useEffect(() => {
    const pending = pendingLocalDownloadsRef.current;
    if (pending.size === 0) return;

    downloads.forEach((d) => {
      const key = `${d.fileId}:${d.messageId || ""}`;
      const fallbackKey = `${d.fileId}:`;

      if ((d.status === "ready" && d.proxyUrl) || d.status === "failed" || d.status === "stopped" || d.status === "expired") {
        if (pending.has(key)) {
          pending.delete(key);
          if (d.status === "ready" && d.proxyUrl) {
            void downloadProxyFile(d.proxyUrl, d.fileName);
          }
        } else if (pending.has(fallbackKey)) {
          pending.delete(fallbackKey);
          if (d.status === "ready" && d.proxyUrl) {
            void downloadProxyFile(d.proxyUrl, d.fileName);
          }
        }
      }
    });
  }, [downloads]);
  
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

  const isAllSelected = useMemo(() => {
    return filteredFiles.length > 0 && filteredFiles.every(f => selectedFileIds.has(f.id));
  }, [filteredFiles, selectedFileIds]);

  const isSomeSelected = useMemo(() => {
    const selectedCount = filteredFiles.filter(f => selectedFileIds.has(f.id)).length;
    return selectedCount > 0 && selectedCount < filteredFiles.length;
  }, [filteredFiles, selectedFileIds]);

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      const next = new Set(selectedFileIds);
      filteredFiles.forEach(f => next.delete(f.id));
      setSelectedFileIds(next);
    } else {
      const next = new Set(selectedFileIds);
      filteredFiles.forEach(f => next.add(f.id));
      setSelectedFileIds(next);
    }
  };

  const handleSelectRowToggle = (fileId: string) => {
    const next = new Set(selectedFileIds);
    if (next.has(fileId)) {
      next.delete(fileId);
    } else {
      next.add(fileId);
    }
    setSelectedFileIds(next);
  };

  const handleBatchDownload = async () => {
    const filesToDownload = workspaceFiles.filter(f => selectedFileIds.has(f.id));

    for (const file of filesToDownload) {
      const active = downloads.find(d => d.fileId === file.fileId && (d.messageId || "") === (file.messageId || ""))
        || downloads.find(d => d.fileId === file.fileId);
      
      if (active && active.status === "ready" && active.proxyUrl) {
        // Already ready: trigger local download immediately
        try {
          await downloadProxyFile(active.proxyUrl, active.fileName || file.fileName);
        } catch (err) {
          console.error(`Failed to trigger local download for ${file.fileName}`, err);
        }
      } else {
        // Not ready on server: queue for automatic local download once ready
        const key = `${file.fileId}:${file.messageId || ""}`;
        pendingLocalDownloadsRef.current.add(key);

        // If not already downloading or queued, trigger download to server
        const isCurrentlyActive = active && (active.status === "downloading" || active.status === "queued" || active.status === "paused");
        if (!isCurrentlyActive) {
          try {
            await downloadMedia(file.fileId, file.messageId, file.fileName, file.sizeBytes);
          } catch (err) {
            console.error(`Failed to trigger download to server for ${file.fileName}`, err);
          }
        }
      }
    }

    setSelectedFileIds(new Set());
  };

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
      className="animate-fade-in workspace-page"
    >
      {/* Workspace Header */}
      <div
        className="workspace-header"
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
          className="filters-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          {/* Search Input */}
          <div
            className="search-wrapper"
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
            className="bot-filter-wrapper"
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

        </div>

        {/* File Type Filter Pills */}
        <div
          className="type-pills-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            borderTop: "1px solid var(--border-color)",
            paddingTop: "12px",
          }}
        >
          <span className="type-pills-label" style={{ fontSize: "0.8rem", fontWeight: "600", color: "var(--text-secondary)", marginRight: "4px" }}>
            类型筛选:
          </span>
          {FILE_TYPE_OPTIONS.map((option) => {
            const isActive = selectedFileType === option.key;
            const Icon = getFileTypeIconComponent(option.key);
            return (
              <button
                key={option.key}
                onClick={() => setSelectedFileType(option.key)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "9999px",
                  fontSize: "0.78rem",
                  fontWeight: "500",
                  cursor: "pointer",
                  border: isActive ? "1px solid var(--accent-blue)" : "1px solid var(--border-color)",
                  backgroundColor: isActive ? "var(--accent-blue-transparent)" : "var(--bg-app)",
                  color: isActive ? "var(--accent-blue)" : "var(--text-secondary)",
                  transition: "all 0.15s ease",
                }}
              >
                <Icon size={13} style={{ color: isActive ? "var(--accent-blue)" : "var(--text-muted)" }} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Files List Area */}
      <div
        className="files-list-area"
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
                  <th className="col-checkbox" style={{ width: "40px", padding: "12px 16px", backgroundColor: "#f8fafc", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={input => {
                        if (input) {
                          input.indeterminate = isSomeSelected;
                        }
                      }}
                      onChange={handleSelectAllToggle}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  <th className="col-filename" style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colFileName")}
                  </th>
                  <th className="col-bot" style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colBot")}
                  </th>
                  <th className="col-sender" style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colSender")}
                  </th>
                  <th className="col-tag" style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colTag")}
                  </th>
                  <th className="col-date" style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colDate")}
                  </th>
                  <th className="col-status" style={{ padding: "12px 16px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc", textAlign: "right" }}>
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
                      style={{ 
                        borderBottom: "1px solid var(--border-color)", 
                        transition: "background-color 0.15s ease",
                        backgroundColor: selectedFileIds.has(file.id) ? "var(--accent-blue-transparent)" : "transparent"
                      }}
                      className="table-row-hover"
                    >
                      {/* Checkbox Column */}
                      <td className="col-checkbox" style={{ padding: "12px 16px", textAlign: "center", verticalAlign: "middle" }}>
                        <input
                          type="checkbox"
                          checked={selectedFileIds.has(file.id)}
                          onChange={() => handleSelectRowToggle(file.id)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      {/* File Name Column */}
                      <td className="col-filename" style={{ padding: "12px 16px", verticalAlign: "middle" }}>
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
                            {/* Mobile-only inline metadata */}
                            <div className="mobile-only-file-meta" style={{ display: "none", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
                                <span style={{
                                  display: "inline-block",
                                  backgroundColor: "var(--accent-blue-transparent)",
                                  color: "var(--accent-blue)",
                                  fontSize: "0.65rem",
                                  fontWeight: "600",
                                  padding: "1px 6px",
                                  borderRadius: "4px"
                                }}>
                                  {getBotTitle(file.botId)}
                                </span>
                                {file.tag && (
                                  <span style={{
                                    fontSize: "0.65rem",
                                    color: "var(--accent-blue)",
                                    backgroundColor: "var(--accent-blue-transparent)",
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    fontWeight: "600"
                                  }}>
                                    #{file.tag}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                                来自: {file.senderName} · {new Date(file.receivedAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Bot Column */}
                      <td className="col-bot" style={{ padding: "12px 16px", verticalAlign: "middle" }}>
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
                      <td className="col-sender" style={{ padding: "12px 16px", verticalAlign: "middle", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                        {file.senderName}
                      </td>

                      {/* Tag Column */}
                      <td className="col-tag" style={{ padding: "12px 16px", verticalAlign: "middle" }}>
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
                      <td className="col-date" style={{ padding: "12px 16px", verticalAlign: "middle", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                        {new Date(file.receivedAt).toLocaleDateString()}
                      </td>

                      {/* Download Status Column */}
                      <td className="col-status" style={{ padding: "12px 16px", verticalAlign: "middle", textAlign: "right" }}>
                        <div style={{ display: "inline-block", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                          <DownloadProgress
                            fileId={file.fileId}
                            fileName={file.fileName}
                            sizeBytes={file.sizeBytes}
                            messageId={file.messageId}
                            compact={true}
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

      {selectedFileIds.size > 0 && (
        <div className="batch-action-bar">
          <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "#e2e8f0" }}>
            已选中 {selectedFileIds.size} 个文件
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleBatchDownload}
              className="btn-download-action success"
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.8rem",
                cursor: "pointer",
                fontWeight: "600"
              }}
            >
              <Download size={14} />
              批量下载到本地
            </button>
            <button
              onClick={() => setSelectedFileIds(new Set())}
              style={{
                backgroundColor: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "#e2e8f0",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
              }}
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* Active Downloads Floating Panel */}
      {(() => {
        const activeDownloads = downloads.filter(
          (d) => d.status === "queued" || d.status === "downloading" || d.status === "paused" || d.status === "failed" || d.status === "stopped"
        );
        if (activeDownloads.length === 0) return null;
        return (
          <div
            style={{
              position: "fixed",
              bottom: "24px",
              right: "24px",
              width: "320px",
              backgroundColor: "#ffffff",
              border: "1px solid var(--border-color)",
              borderRadius: "12px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)",
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "10px 14px",
                backgroundColor: "rgba(241, 245, 249, 0.5)",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Loader size={14} className="animate-spin" style={{ color: "var(--accent-blue)" }} />
                <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-primary)" }}>
                  文件下载状态 ({activeDownloads.length})
                </span>
              </div>
            </div>

            {/* List */}
            <div
              style={{
                maxHeight: "300px",
                overflowY: "auto",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {activeDownloads.map((d) => (
                <div
                  key={d.id}
                  style={{
                    padding: "8px 10px",
                    backgroundColor: "var(--bg-app)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.fileName}>
                    {d.fileName || "未知文件"}
                  </div>
                  <DownloadProgress
                    fileId={d.fileId}
                    messageId={d.messageId}
                    sizeBytes={d.sizeBytes}
                    fileName={d.fileName}
                    hideControls={true}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <style>{`
        .table-row-hover:hover td {
          background-color: #f8fafc !important;
        }
      `}</style>
    </div>
  );
};
