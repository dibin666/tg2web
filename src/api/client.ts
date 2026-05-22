import {
  AccessKey,
  AccessKeyLoginRequest,
  AdminLoginRequest,
  AppEvent,
  AuthLoginResponse,
  BotCommand,
  BotSummary,
  ChatMessage,
  ClearDownloadCacheResponse,
  CreateAccessKeyRequest,
  DiscoveredTelegramChat,
  DownloadCacheSummary,
  DownloadItem,
  InlineKeyboardClickRequest,
  InlineKeyboardClickResponse,
  LoginCodeRequest,
  LoginPasswordRequest,
  LoginPhoneRequest,
  MeResponse,
  PatchPublishedBotRequest,
  PublishedBot,
  PublishBotRequest,
  SaveTelegramCredentialsRequest,
  SendMessageRequest,
  Settings,
  TelegramStatusResponse,
  WorkspaceFile,
} from "./types";

export interface ApiClient {
  getHealth(): Promise<{ status: string }>;
  getMe(): Promise<MeResponse>;
  getBots(): Promise<BotSummary[]>;
  getBotCommands(botId: string): Promise<BotCommand[]>;
  getMessages(botId: string, before?: string, limit?: number): Promise<ChatMessage[]>;
  sendMessage(botId: string, request: SendMessageRequest): Promise<ChatMessage>;
  clickInlineKeyboardButton(botId: string, messageId: string, request: InlineKeyboardClickRequest): Promise<InlineKeyboardClickResponse>;
  uploadFile(botId: string, file: File): Promise<{ fileId: string; fileName: string; sizeBytes: number }>;
  getDownloads(): Promise<DownloadItem[]>;
  getDownload(downloadId: string): Promise<DownloadItem>;
  triggerDownload(fileId: string, messageId?: string, fileName?: string, sizeBytes?: number): Promise<DownloadItem>;
  pauseDownload(downloadId: string): Promise<DownloadItem>;
  resumeDownload(downloadId: string): Promise<DownloadItem>;
  stopDownload(downloadId: string): Promise<DownloadItem>;
  getSettings(): Promise<Settings>;
  updateSettings(settings: Partial<Settings>): Promise<Settings>;
  subscribeToEvents(onEvent: (event: AppEvent) => void, onAuthLost?: () => void): () => void;
  getWorkspaceFiles(): Promise<WorkspaceFile[]>;
  updateFileStatus(fileId: string, status: "pending" | "approved" | "rejected"): Promise<WorkspaceFile>;
  updateFileTag(fileId: string, tag: string): Promise<WorkspaceFile>;
}
export const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
  };
};

const apiBaseUrl = VITE_API_BASE_URL.replace(/\/$/, "");
const AUTH_TOKEN_KEY = "tg2web_auth_token";

export const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY);

export const setAuthToken = (token: string) => {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
};

export const clearAuthToken = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
};

const apiUrl = (path: string) => `${apiBaseUrl}${path}`;

const wsUrl = (path: string, token?: string) => {
  const withToken = (urlString: string) => {
    const url = new URL(urlString);
    if (token) url.searchParams.set("token", token);
    return url.toString();
  };

  if (apiBaseUrl) {
    const url = new URL(apiBaseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return withToken(url.toString());
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return withToken(`${protocol}//${window.location.host}${path}`);
};

async function responseErrorMessage(response: Response) {
  const fallback = `Request failed with ${response.status}`;
  const text = await response.text();
  if (!text) return fallback;

  try {
    const body = JSON.parse(text) as ErrorEnvelope;
    return body.error?.message || fallback;
  } catch {
    return text;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined;

  if (hasBody && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const token = getAuthToken();
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

const jsonBody = (value: unknown) => JSON.stringify(value);

export const proxyPathForFile = (fileId: string) => `/api/files/${encodeURIComponent(fileId)}/proxy`;

export async function proxyFileObjectUrl(path: string): Promise<string> {
  const headers = new Headers();
  const token = getAuthToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(apiUrl(path), { headers });
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }

  return URL.createObjectURL(await response.blob());
}

export async function downloadProxyFile(path: string, fileName?: string): Promise<void> {
  const headers = new Headers();
  const token = getAuthToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(apiUrl(path), { headers });
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName || "telegram-file";
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export const apiClient: ApiClient = {
  getHealth() {
    return request<{ status: string }>("/api/health");
  },

  getMe() {
    return request<MeResponse>("/api/me");
  },

  getBots() {
    return request<BotSummary[]>("/api/bots");
  },

  getBotCommands(botId: string) {
    return request<BotCommand[]>(`/api/bots/${encodeURIComponent(botId)}/commands`);
  },

  getMessages(botId: string, before?: string, limit?: number) {
    const params = new URLSearchParams();
    if (before) params.set("before", before);
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return request<ChatMessage[]>(`/api/bots/${encodeURIComponent(botId)}/messages${query ? `?${query}` : ""}`);
  },

  sendMessage(botId: string, body: SendMessageRequest) {
    return request<ChatMessage>(`/api/bots/${encodeURIComponent(botId)}/messages`, {
      method: "POST",
      body: jsonBody(body),
    });
  },

  clickInlineKeyboardButton(botId: string, messageId: string, body: InlineKeyboardClickRequest) {
    return request<InlineKeyboardClickResponse>(`/api/bots/${encodeURIComponent(botId)}/messages/${encodeURIComponent(messageId)}/callback`, {
      method: "POST",
      body: jsonBody(body),
    });
  },

  uploadFile(botId: string, file: File) {
    const formData = new FormData();
    formData.set("file", file);
    return request<{ fileId: string; fileName: string; sizeBytes: number }>(`/api/bots/${encodeURIComponent(botId)}/uploads`, {
      method: "POST",
      body: formData,
    });
  },

  getDownloads() {
    return request<DownloadItem[]>("/api/downloads");
  },

  getDownload(downloadId: string) {
    return request<DownloadItem>(`/api/downloads/${encodeURIComponent(downloadId)}`);
  },

  triggerDownload(fileId: string, messageId?: string, fileName?: string, sizeBytes?: number) {
    return request<DownloadItem>("/api/downloads", {
      method: "POST",
      body: jsonBody({ fileId, messageId, fileName, sizeBytes }),
    });
  },

  pauseDownload(downloadId: string) {
    return request<DownloadItem>(`/api/downloads/${encodeURIComponent(downloadId)}/pause`, {
      method: "POST",
    });
  },

  resumeDownload(downloadId: string) {
    return request<DownloadItem>(`/api/downloads/${encodeURIComponent(downloadId)}/resume`, {
      method: "POST",
    });
  },

  stopDownload(downloadId: string) {
    return request<DownloadItem>(`/api/downloads/${encodeURIComponent(downloadId)}/stop`, {
      method: "POST",
    });
  },

  getSettings() {
    return request<Settings>("/api/settings");
  },

  updateSettings(settings: Partial<Settings>) {
    return request<Settings>("/api/settings", {
      method: "POST",
      body: jsonBody(settings),
    });
  },

  subscribeToEvents(onEvent: (event: AppEvent) => void, onAuthLost?: () => void) {
    const token = getAuthToken();
    if (!token) return () => undefined;

    let closed = false;
    let retryTimer: number | undefined;
    let socket: WebSocket | null = null;
    let lastEventId: string | undefined;
    const seenEventIds = new Set<string>();

    const dispatchEvent = (event: AppEvent) => {
      if (seenEventIds.has(event.eventId)) return;
      seenEventIds.add(event.eventId);
      if (seenEventIds.size > 1000) {
        const oldest = seenEventIds.values().next().value;
        if (oldest) seenEventIds.delete(oldest);
      }
      lastEventId = event.eventId;
      onEvent(event);
    };

    const replayMissedEvents = async () => {
      if (!lastEventId || closed) return;

      try {
        const params = new URLSearchParams({ after: lastEventId });
        const events = await request<AppEvent[]>(`/api/events/replay?${params.toString()}`);
        if (closed) return;
        events.forEach(dispatchEvent);
      } catch (error) {
        console.error("Failed to replay websocket events", error);
      }
    };

    const verifySessionBeforeRetry = async () => {
      try {
        await request<MeResponse>("/api/me");
        return true;
      } catch {
        closed = true;
        clearAuthToken();
        onAuthLost?.();
        return false;
      }
    };

    const connect = () => {
      socket = new WebSocket(wsUrl("/api/ws", token));

      socket.onopen = () => {
        void replayMissedEvents();
      };

      socket.onmessage = (message) => {
        try {
          dispatchEvent(JSON.parse(message.data) as AppEvent);
        } catch (error) {
          console.error("Failed to parse websocket event", error);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (closed) return;

        retryTimer = window.setTimeout(async () => {
          if (!closed && (await verifySessionBeforeRetry())) {
            connect();
          }
        }, 1500);
      };
    };

    const connectTimer = window.setTimeout(connect, 0);

    return () => {
      closed = true;
      if (connectTimer) window.clearTimeout(connectTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  },

  getWorkspaceFiles() {
    return request<WorkspaceFile[]>("/api/workspace/files");
  },

  updateFileStatus(fileId: string, status: "pending" | "approved" | "rejected") {
    return request<WorkspaceFile>(`/api/workspace/files/${encodeURIComponent(fileId)}/status`, {
      method: "PATCH",
      body: jsonBody({ status }),
    });
  },

  updateFileTag(fileId: string, tag: string) {
    return request<WorkspaceFile>(`/api/workspace/files/${encodeURIComponent(fileId)}/tag`, {
      method: "PATCH",
      body: jsonBody({ tag }),
    });
  },
};

export const authApiClient = {
  loginAdmin(body: AdminLoginRequest) {
    return request<AuthLoginResponse>("/api/auth/admin/login", {
      method: "POST",
      body: jsonBody(body),
    });
  },

  loginAccessKey(body: AccessKeyLoginRequest) {
    return request<AuthLoginResponse>("/api/auth/access-key/login", {
      method: "POST",
      body: jsonBody(body),
    });
  },
};

export const adminApiClient = {
  listAccessKeys() {
    return request<AccessKey[]>("/api/admin/access-keys");
  },

  createAccessKey(body: CreateAccessKeyRequest) {
    return request<AccessKey>("/api/admin/access-keys", {
      method: "POST",
      body: jsonBody(body),
    });
  },

  revokeAccessKey(id: string) {
    return request<void>(`/api/admin/access-keys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  getTelegramStatus() {
    return request<TelegramStatusResponse>("/api/admin/telegram/status");
  },

  saveTelegramCredentials(body: SaveTelegramCredentialsRequest) {
    return request<TelegramStatusResponse>("/api/admin/telegram/credentials", {
      method: "PUT",
      body: jsonBody(body),
    });
  },

  loginPhone(body: LoginPhoneRequest) {
    return request<TelegramStatusResponse>("/api/admin/telegram/login/phone", {
      method: "POST",
      body: jsonBody(body),
    });
  },

  loginCode(body: LoginCodeRequest) {
    return request<TelegramStatusResponse>("/api/admin/telegram/login/code", {
      method: "POST",
      body: jsonBody(body),
    });
  },

  loginPassword(body: LoginPasswordRequest) {
    return request<TelegramStatusResponse>("/api/admin/telegram/login/password", {
      method: "POST",
      body: jsonBody(body),
    });
  },

  startQrLogin() {
    return request<TelegramStatusResponse>("/api/admin/telegram/login/qr", {
      method: "POST",
    });
  },

  reconnectTelegram() {
    return request<TelegramStatusResponse>("/api/admin/telegram/reconnect", {
      method: "POST",
    });
  },

  logoutTelegram() {
    return request<TelegramStatusResponse>("/api/admin/telegram/logout", {
      method: "POST",
    });
  },

  clearDownloadCache() {
    return request<ClearDownloadCacheResponse>("/api/admin/download-cache", {
      method: "DELETE",
    });
  },

  getDownloadCache() {
    return request<DownloadCacheSummary>("/api/admin/download-cache");
  },

  clearDownloadCacheFile(fileId: string) {
    return request<ClearDownloadCacheResponse>(`/api/admin/download-cache/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
    });
  },

  listTelegramChats(query?: string) {
    const params = new URLSearchParams({ kind: "bot" });
    if (query) params.set("query", query);
    return request<DiscoveredTelegramChat[]>(`/api/admin/telegram/chats?${params.toString()}`);
  },

  searchTelegramUsername(username: string) {
    return request<DiscoveredTelegramChat>("/api/admin/telegram/chats/search-username", {
      method: "POST",
      body: jsonBody({ username }),
    });
  },

  listPublishedBots() {
    return request<PublishedBot[]>("/api/admin/published-bots");
  },

  publishBot(body: PublishBotRequest) {
    return request<PublishedBot>("/api/admin/published-bots", {
      method: "POST",
      body: jsonBody(body),
    });
  },

  patchPublishedBot(id: string, body: PatchPublishedBotRequest) {
    return request<PublishedBot>(`/api/admin/published-bots/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: jsonBody(body),
    });
  },

  unpublishBot(id: string) {
    return request<void>(`/api/admin/published-bots/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  syncPublishedBotHistory(id: string) {
    return request<void>(`/api/admin/published-bots/${encodeURIComponent(id)}/sync-history`, {
      method: "POST",
    });
  },
};
