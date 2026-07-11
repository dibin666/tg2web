import React from "react";
import { useApp } from "../context/AppContext";
import { DownloadProgress } from "../components/DownloadProgress";
import { PageHeader } from "../components/PageHeader";
import { Download, File, HardDrive, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const formatBytes = (bytes?: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const statusColorClass = (status: string) => {
  switch (status) {
    case "ready":
      return "text-success";
    case "downloading":
    case "queued":
      return "text-primary";
    case "failed":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
};

export const DownloadsPage: React.FC = () => {
  const { downloads } = useApp();

  return (
    <div className="scrollbar-thin h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-6 max-sm:p-4">
        <PageHeader
          icon={<Download className="size-5" />}
          title="服务器代理下载队列"
          description="通过共享服务账号处理的文件下载。文件先缓存到服务器本地,再流式传输到浏览器,以保证审计边界安全。"
        />

        {/* Security note */}
        <div className="flex gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--info)_25%,transparent)] bg-[var(--info-soft)] px-4 py-3 text-xs leading-relaxed text-foreground/80">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-info" />
          <div>
            <strong>服务器代理防护</strong>:浏览器不会直接连接 Telegram CDN 获取文件,所有外发请求均由中继服务器代理,下载日志会关联内部用户以便团队审计。
          </div>
        </div>

        {/* Downloads table */}
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-2 border-b bg-muted/50 px-4 py-2.5 text-[11px] font-bold tracking-wider text-muted-foreground max-sm:grid-cols-[1fr_auto]">
            <span>文件名</span>
            <span className="max-sm:hidden">大小</span>
            <span className="max-sm:hidden">状态</span>
            <span className="text-right">操作 / 进度</span>
          </div>

          {downloads.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-14 text-center text-muted-foreground">
              <HardDrive className="mb-2 size-7 opacity-40" />
              <div className="text-sm">还没有触发任何下载。</div>
              <div className="text-xs">在会话中点击任意媒体附件上的下载按钮即可开始。</div>
            </div>
          ) : (
            downloads.map((dl) => (
              <div
                key={dl.id}
                className="grid grid-cols-[2fr_1fr_1fr_2fr] items-center gap-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-accent/30 max-sm:grid-cols-[1fr_auto]"
              >
                {/* File info */}
                <div className="flex min-w-0 items-center gap-2.5">
                  <File className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium" title={dl.fileName}>
                      {dl.fileName || "telegram_file.bin"}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground sm:hidden">
                      <span>{formatBytes(dl.sizeBytes)}</span>
                      <span>•</span>
                      <span className={cn("font-semibold capitalize", statusColorClass(dl.status))}>{dl.status}</span>
                    </div>
                  </div>
                </div>

                <span className="text-xs text-muted-foreground max-sm:hidden">{formatBytes(dl.sizeBytes)}</span>

                <span className={cn("text-xs font-semibold capitalize max-sm:hidden", statusColorClass(dl.status))}>
                  {dl.status}
                </span>

                <div className="flex justify-end">
                  <DownloadProgress
                    fileId={dl.fileId}
                    fileName={dl.fileName}
                    sizeBytes={dl.sizeBytes}
                    messageId={dl.messageId}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
