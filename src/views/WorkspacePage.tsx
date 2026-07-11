import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { downloadProxyFile } from "../api/client";
import { DownloadProgress } from "../components/DownloadProgress";
import { PageHeader } from "../components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Tag,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  File,
  FolderOpen,
  Archive,
  Download,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

  if (mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg|avif|heic)$/.test(name)) return { key: "image", label: "图片" };
  if (mime.includes("zip") || mime.includes("rar") || mime.includes("7z") || /\.(zip|rar|7z|tar|gz|tgz|bz2|xz)$/.test(name)) return { key: "archive", label: "压缩包" };
  if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/.test(name)) return { key: "audio", label: "音频" };
  if (mime.startsWith("video/") || /\.(mp4|avi|mov|mkv|webm|m4v)$/.test(name)) return { key: "video", label: "视频" };
  if (mime.startsWith("text/") || mime.includes("pdf") || mime.includes("document") || mime.includes("spreadsheet") || /\.(txt|pdf|doc|docx|xls|xlsx|csv|json|md|epub)$/.test(name)) return { key: "document", label: "文档" };
  return { key: "other", label: "其他" };
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals < 0 ? 0 : decimals)) + " " + sizes[i];
};

const FileIcon: React.FC<{ mimeType: string; fileName: string }> = ({ mimeType, fileName }) => {
  const key = fileTypeFor(mimeType, fileName).key;
  const map: Record<string, { Icon: typeof File; className: string }> = {
    image: { Icon: ImageIcon, className: "text-info" },
    archive: { Icon: Archive, className: "text-chart-5" },
    video: { Icon: Film, className: "text-warning" },
    audio: { Icon: Music, className: "text-success" },
    document: { Icon: FileText, className: "text-primary" },
    other: { Icon: File, className: "text-muted-foreground" },
  };
  const { Icon, className } = map[key] || map.other;
  return <Icon className={cn("size-5", className)} />;
};

export const WorkspacePage: React.FC = () => {
  const { workspaceFiles, bots, updateFileTag, t, downloads, downloadMedia } = useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBotId, setSelectedBotId] = useState<string>("all");
  const [selectedFileType, setSelectedFileType] = useState<FileTypeKey>("all");
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const pendingLocalDownloadsRef = React.useRef<Set<string>>(new Set());
  const [editingTagFileId, setEditingTagFileId] = useState<string | null>(null);
  const [tempTagValue, setTempTagValue] = useState("");

  // Auto-trigger local browser download when a queued file becomes ready on the server
  React.useEffect(() => {
    const pending = pendingLocalDownloadsRef.current;
    if (pending.size === 0) return;

    downloads.forEach((d) => {
      const key = `${d.fileId}:${d.messageId || ""}`;
      const fallbackKey = `${d.fileId}:`;

      if ((d.status === "ready" && d.proxyUrl) || d.status === "failed" || d.status === "stopped" || d.status === "expired") {
        if (pending.has(key)) {
          pending.delete(key);
          if (d.status === "ready" && d.proxyUrl) void downloadProxyFile(d.proxyUrl, d.fileName);
        } else if (pending.has(fallbackKey)) {
          pending.delete(fallbackKey);
          if (d.status === "ready" && d.proxyUrl) void downloadProxyFile(d.proxyUrl, d.fileName);
        }
      }
    });
  }, [downloads]);

  const filteredFiles = useMemo(() => {
    return workspaceFiles.filter((file) => {
      if (selectedBotId !== "all" && file.botId !== selectedBotId) return false;
      const fileType = fileTypeFor(file.mimeType, file.fileName);
      if (selectedFileType !== "all" && fileType.key !== selectedFileType) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          file.fileName.toLowerCase().includes(q) ||
          (file.tag ? file.tag.toLowerCase().includes(q) : false) ||
          file.senderName.toLowerCase().includes(q) ||
          fileType.label.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [workspaceFiles, selectedBotId, selectedFileType, searchQuery]);

  const isAllSelected = filteredFiles.length > 0 && filteredFiles.every((f) => selectedFileIds.has(f.id));
  const selectedCount = filteredFiles.filter((f) => selectedFileIds.has(f.id)).length;
  const isSomeSelected = selectedCount > 0 && selectedCount < filteredFiles.length;

  const handleSelectAllToggle = () => {
    const next = new Set(selectedFileIds);
    if (isAllSelected) filteredFiles.forEach((f) => next.delete(f.id));
    else filteredFiles.forEach((f) => next.add(f.id));
    setSelectedFileIds(next);
  };

  const handleSelectRowToggle = (fileId: string) => {
    const next = new Set(selectedFileIds);
    if (next.has(fileId)) next.delete(fileId);
    else next.add(fileId);
    setSelectedFileIds(next);
  };

  const handleBatchDownload = async () => {
    const filesToDownload = workspaceFiles.filter((f) => selectedFileIds.has(f.id));
    for (const file of filesToDownload) {
      const active =
        downloads.find((d) => d.fileId === file.fileId && (d.messageId || "") === (file.messageId || "")) ||
        downloads.find((d) => d.fileId === file.fileId);

      if (active && active.status === "ready" && active.proxyUrl) {
        try {
          await downloadProxyFile(active.proxyUrl, active.fileName || file.fileName);
        } catch (err) {
          console.error(`Failed to trigger local download for ${file.fileName}`, err);
        }
      } else {
        pendingLocalDownloadsRef.current.add(`${file.fileId}:${file.messageId || ""}`);
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

  const handleSaveTag = async (fileId: string) => {
    await updateFileTag(fileId, tempTagValue.trim());
    setEditingTagFileId(null);
  };

  const getBotTitle = (botId: string) => bots.find((b) => b.id === botId)?.title || `Bot [${botId}]`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Header + filters */}
      <div className="shrink-0 border-b bg-card px-6 py-5 max-sm:px-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <PageHeader
            icon={<FolderOpen className="size-5" />}
            title={t("fileHistoryTitle")}
            description={t("fileHistoryDesc")}
          />

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-64 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 rounded-xl pl-9"
              />
            </div>
            <Select value={selectedBotId} onValueChange={setSelectedBotId}>
              <SelectTrigger className="h-9 w-48 rounded-xl text-sm">
                <SelectValue placeholder={t("allBots")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allBots")}</SelectItem>
                {bots.map((bot) => (
                  <SelectItem key={bot.id} value={bot.id}>
                    {bot.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-muted-foreground">类型筛选:</span>
            {FILE_TYPE_OPTIONS.map((option) => {
              const isActive = selectedFileType === option.key;
              const Icon = getFileTypeIconComponent(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSelectedFileType(option.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* File list */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-6 max-sm:p-4">
        <div className="mx-auto w-full max-w-6xl">
          {filteredFiles.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed bg-card p-8 text-center text-muted-foreground">
              <FolderOpen className="mb-3 size-12 stroke-[1.5] opacity-40" />
              <h3 className="text-sm font-semibold text-foreground">{t("noFilesFound")}</h3>
              <p className="max-w-xs text-xs">{t("noFilesDesc")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="w-10 px-4 py-3 text-center">
                        <Checkbox
                          checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                          onCheckedChange={handleSelectAllToggle}
                        />
                      </th>
                      <th className="px-4 py-3 font-bold">{t("colFileName")}</th>
                      <th className="px-4 py-3 font-bold">{t("colBot")}</th>
                      <th className="px-4 py-3 font-bold">{t("colSender")}</th>
                      <th className="px-4 py-3 font-bold">{t("colTag")}</th>
                      <th className="px-4 py-3 font-bold">{t("colDate")}</th>
                      <th className="px-4 py-3 text-right font-bold">{t("colDownloadStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFiles.map((file) => {
                      const isEditingTag = editingTagFileId === file.id;
                      const fileType = fileTypeFor(file.mimeType, file.fileName);
                      const isSelected = selectedFileIds.has(file.id);

                      return (
                        <tr
                          key={file.id}
                          className={cn(
                            "border-b transition-colors last:border-b-0 hover:bg-accent/30",
                            isSelected && "bg-primary/5"
                          )}
                        >
                          <td className="px-4 py-3 text-center align-middle">
                            <Checkbox checked={isSelected} onCheckedChange={() => handleSelectRowToggle(file.id)} />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center gap-2.5">
                              <FileIcon mimeType={file.mimeType} fileName={file.fileName} />
                              <div className="flex min-w-0 flex-col">
                                <span className="max-w-60 truncate text-sm font-semibold" title={file.fileName}>
                                  {file.fileName}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {fileType.label} · {formatBytes(file.sizeBytes)}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <Badge className="rounded-md border-transparent bg-primary/10 text-[11px] font-semibold text-primary">
                              {getBotTitle(file.botId)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 align-middle text-xs text-muted-foreground">{file.senderName}</td>
                          <td className="px-4 py-3 align-middle">
                            {isEditingTag ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={tempTagValue}
                                  onChange={(e) => setTempTagValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveTag(file.id);
                                    if (e.key === "Escape") setEditingTagFileId(null);
                                  }}
                                  autoFocus
                                  className="h-7 w-28 rounded-md text-xs"
                                />
                                <Button size="icon" className="size-7 rounded-md" onClick={() => handleSaveTag(file.id)}>
                                  <Check className="size-3" />
                                </Button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTagFileId(file.id);
                                  setTempTagValue(file.tag || "");
                                }}
                                className={cn(
                                  "inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                                  file.tag ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                                )}
                                title="点击编辑标签"
                              >
                                <Tag className="size-3 opacity-70" />
                                <span>{file.tag || t("addTag")}</span>
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                            {new Date(file.receivedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right align-middle">
                            <div className="inline-block" onClick={(e) => e.stopPropagation()}>
                              <DownloadProgress
                                fileId={file.fileId}
                                fileName={file.fileName}
                                sizeBytes={file.sizeBytes}
                                messageId={file.messageId}
                                compact
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Batch action bar */}
      {selectedFileIds.size > 0 && (
        <div className="message-entry glass-panel shadow-float fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-2xl px-5 py-3">
          <span className="text-sm font-semibold">已选中 {selectedFileIds.size} 个文件</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleBatchDownload}
              className="gradient-brand rounded-xl text-white hover:opacity-90"
            >
              <Download className="size-4" />
              批量下载到本地
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setSelectedFileIds(new Set())}>
              取消选择
            </Button>
          </div>
        </div>
      )}

      {/* Active downloads floating panel */}
      {(() => {
        const activeDownloads = downloads.filter(
          (d) => d.status === "queued" || d.status === "downloading" || d.status === "paused" || d.status === "failed" || d.status === "stopped"
        );
        if (activeDownloads.length === 0) return null;
        return (
          <div className="glass-panel shadow-float fixed bottom-6 right-6 z-40 flex max-h-[380px] w-80 flex-col overflow-hidden rounded-2xl max-sm:hidden">
            <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-2.5">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="text-sm font-semibold">文件下载状态 ({activeDownloads.length})</span>
            </div>
            <div className="scrollbar-thin flex min-h-0 flex-col gap-2.5 overflow-y-auto p-3">
              {activeDownloads.map((d) => (
                <div key={d.id} className="flex flex-col gap-1.5 rounded-xl border bg-card/60 p-2.5">
                  <div className="truncate text-xs font-semibold" title={d.fileName}>
                    {d.fileName || "未知文件"}
                  </div>
                  <DownloadProgress
                    fileId={d.fileId}
                    messageId={d.messageId}
                    sizeBytes={d.sizeBytes}
                    fileName={d.fileName}
                    hideControls
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
