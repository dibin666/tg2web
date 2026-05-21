import { BotSummary, ChatMessage, SendMessageRequest, DownloadItem, Settings, AppEvent, WorkspaceFile } from "./types";

export interface ApiClient {
  getHealth(): Promise<{ status: string }>;
  getMe(): Promise<{ id: string; displayName: string }>;
  getBots(): Promise<BotSummary[]>;
  getMessages(botId: string, before?: string, limit?: number): Promise<ChatMessage[]>;
  sendMessage(botId: string, request: SendMessageRequest): Promise<ChatMessage>;
  uploadFile(botId: string, file: File): Promise<{ fileId: string; fileName: string; sizeBytes: number }>;
  getDownloads(): Promise<DownloadItem[]>;
  getDownload(downloadId: string): Promise<DownloadItem>;
  triggerDownload(fileId: string, messageId?: string, fileName?: string, sizeBytes?: number): Promise<DownloadItem>;
  getSettings(): Promise<Settings>;
  updateSettings(settings: Partial<Settings>): Promise<Settings>;
  subscribeToEvents(onEvent: (event: AppEvent) => void): () => void;
  getWorkspaceFiles(): Promise<WorkspaceFile[]>;
  updateFileStatus(fileId: string, status: "pending" | "approved" | "rejected"): Promise<WorkspaceFile>;
  updateFileTag(fileId: string, tag: string): Promise<WorkspaceFile>;
}
export const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
