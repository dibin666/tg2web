import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { X, Eye, Code, User, Shield, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-xl border bg-background/60 p-3 dark:bg-background/30">
    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
    {children}
  </section>
);

const KvRow: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({ label, children, mono = true }) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className={cn("break-all text-right text-foreground", mono && "font-mono text-[11px]")}>{children}</span>
  </div>
);

const STATUS_TONE: Record<string, string> = {
  received: "bg-[var(--success-soft)] text-success",
  sent: "bg-[var(--success-soft)] text-success",
  edited: "bg-[var(--info-soft)] text-info",
  failed: "bg-[var(--danger-soft)] text-destructive",
  deleted: "bg-muted text-muted-foreground",
  pending: "bg-[var(--warning-soft)] text-warning",
};

export const MessageInspector: React.FC = () => {
  const { selectedMessage, setSelectedMessage } = useApp();
  const [viewMode, setViewMode] = useState<"details" | "json">("details");

  if (!selectedMessage) return null;

  const m = selectedMessage;

  return (
    <div className="flex h-full w-full flex-col bg-card/95">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Database className="size-3.5" />
          </div>
          <h3 className="font-serif text-sm font-semibold">消息元数据</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={() => setSelectedMessage(null)}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* View switch */}
      <div className="shrink-0 border-b px-4 py-2.5">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "details" | "json")}>
          <TabsList className="grid w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="details" className="gap-1.5 rounded-lg text-xs">
              <Eye className="size-3" />
              审计详情
            </TabsTrigger>
            <TabsTrigger value="json" className="gap-1.5 rounded-lg text-xs">
              <Code className="size-3" />
              原始 JSON
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
        {viewMode === "details" ? (
          <div className="flex flex-col gap-3">
            <Section title="标识符 Identifiers">
              <KvRow label="Audit ID">{m.id}</KvRow>
              <KvRow label="Telegram ID">
                <span className={m.telegramMessageId ? "text-primary" : "text-destructive"}>
                  {m.telegramMessageId || "未分配 (失败/待发送)"}
                </span>
              </KvRow>
              <KvRow label="Bot ID">{m.botId}</KvRow>
            </Section>

            <Section title="归属 Attribution">
              <div className="flex items-center gap-2.5 text-sm">
                {m.direction === "outgoing" ? (
                  <>
                    <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Shield className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {m.sentByInternalUser?.displayName || "System Automator"}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        Internal User ID: {m.sentByInternalUser?.id || "N/A"}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--success-soft)] text-success">
                      <User className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Telegram 第三方机器人</div>
                      <div className="text-[10px] text-muted-foreground">外部传入的 webhook 响应</div>
                    </div>
                  </>
                )}
              </div>
            </Section>

            <Section title="状态与历史 Status">
              <KvRow label="方向" mono={false}>
                <span className="capitalize">{m.direction}</span>
              </KvRow>
              <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
                <span className="text-muted-foreground">同步状态</span>
                <Badge className={cn("h-5 rounded-full border-transparent px-2 text-[10px] font-bold uppercase", STATUS_TONE[m.status] || "bg-muted text-muted-foreground")}>
                  {m.status}
                </Badge>
              </div>
              <KvRow label="创建时间" mono={false}>{new Date(m.createdAt).toLocaleString()}</KvRow>
              {m.editedAt && <KvRow label="编辑时间" mono={false}>{new Date(m.editedAt).toLocaleString()}</KvRow>}
              {m.replyToMessageId && <KvRow label="回复消息">{m.replyToMessageId}</KvRow>}
            </Section>

            <Section title={`样式实体 Entities (${m.entities.length})`}>
              {m.entities.length === 0 ? (
                <div className="text-xs text-muted-foreground">文本中没有样式实体。</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {m.entities.map((ent, idx) => (
                    <div key={idx} className="rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-[11px]">
                      <div className="mb-0.5 flex justify-between">
                        <span className="font-semibold text-primary">{ent.type}</span>
                        <span className="text-muted-foreground">
                          offset: {ent.offsetUtf16}, len: {ent.lengthUtf16}
                        </span>
                      </div>
                      {ent.url && (
                        <div className="truncate text-muted-foreground">
                          url:{" "}
                          <a href={ent.url} target="_blank" rel="noopener noreferrer" className="telegram-link">
                            {ent.url}
                          </a>
                        </div>
                      )}
                      {ent.language && <div className="text-muted-foreground">language: {ent.language}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {m.media && m.media.length > 0 && (
              <Section title={`媒体对象 Media (${m.media.length})`}>
                <div className="flex flex-col gap-1.5">
                  {m.media.map((med, idx) => (
                    <div key={idx} className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="font-bold uppercase">{med.kind}</span>
                        {"fileId" in med && (
                          <span className="font-mono text-[10px] text-muted-foreground">{med.fileId}</span>
                        )}
                      </div>
                      {med.kind === "photo" && (
                        <div className="text-muted-foreground">尺寸: {med.width}×{med.height}</div>
                      )}
                      {med.kind === "video" && (
                        <div className="text-muted-foreground">
                          尺寸: {med.width}×{med.height} · 时长: {med.durationSec}s
                        </div>
                      )}
                      {med.kind === "voice" && (
                        <div className="text-muted-foreground">
                          时长: {med.durationSec}s · 波形采样: {med.waveform?.length}
                        </div>
                      )}
                      {med.kind === "document" && (
                        <div className="text-muted-foreground">
                          文件: {med.fileName} · {med.mimeType} · {med.sizeBytes} B
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        ) : (
          <pre className="scrollbar-thin overflow-x-auto whitespace-pre-wrap break-all rounded-xl border bg-foreground/5 p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {JSON.stringify(m, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};
