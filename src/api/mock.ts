import { ApiClient } from "./client";
import { BotSummary, ChatMessage, SendMessageRequest, DownloadItem, Settings, AppEvent, TelegramEntity } from "./types";

// In-Memory state for the session
const mockBots: BotSummary[] = [
  {
    id: "bot_1",
    telegramChatId: "12345001",
    username: "assistant_bot",
    title: "Telegram Assistant Bot",
    avatarUrl: "",
    lastMessagePreview: "Sure, I can help you with scheduling tasks.",
    unreadCount: 0,
    isPinned: true,
    status: "available",
  },
  {
    id: "bot_2",
    telegramChatId: "12345002",
    username: "translator_bot",
    title: "Translate & Summarize Bot",
    avatarUrl: "",
    lastMessagePreview: "Translating your prompt into 5 languages...",
    unreadCount: 3,
    isPinned: false,
    status: "available",
  },
  {
    id: "bot_3",
    telegramChatId: "12345003",
    username: "mj_bot",
    title: "Midjourney Image Bot",
    avatarUrl: "",
    lastMessagePreview: "Image generation complete! Grid #4",
    unreadCount: 0,
    isPinned: false,
    status: "available",
  },
  {
    id: "bot_4",
    telegramChatId: "12345004",
    username: "file_bot",
    title: "Media Storage & Archive",
    avatarUrl: "",
    lastMessagePreview: "Voice note (0:45) received",
    unreadCount: 0,
    isPinned: false,
    status: "available",
  },
  {
    id: "bot_5",
    telegramChatId: "12345005",
    username: "sys_bot",
    title: "System Logs (Restricted)",
    avatarUrl: "",
    lastMessagePreview: "Error: TDLib connectivity failed.",
    unreadCount: 0,
    isPinned: false,
    status: "restricted",
  },
];

const mockInternalUser = {
  id: "user_admin",
  displayName: "Dibin (Lead Dev)",
};

const mockMessages: Record<string, ChatMessage[]> = {
  bot_1: [
    {
      id: "msg_1_1",
      telegramMessageId: "101",
      botId: "bot_1",
      direction: "incoming",
      text: "Hello! I am your Shared Assistant Bot. How can I assist your team today?",
      entities: [],
      status: "received",
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
    {
      id: "msg_1_2",
      telegramMessageId: "102",
      botId: "bot_1",
      direction: "outgoing",
      text: "/help - What commands do you support?",
      entities: [{ type: "code", offsetUtf16: 0, lengthUtf16: 5 }],
      sentByInternalUser: mockInternalUser,
      status: "sent",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "msg_1_3",
      telegramMessageId: "103",
      botId: "bot_1",
      direction: "incoming",
      text: "Here is a list of available tasks:\n1. /schedule - Schedule internal events\n2. /status - Check team systems\n3. /notes - Access shared memo",
      entities: [
        { type: "code", offsetUtf16: 35, lengthUtf16: 9 },
        { type: "code", offsetUtf16: 72, lengthUtf16: 7 },
        { type: "code", offsetUtf16: 104, lengthUtf16: 6 },
      ],
      status: "received",
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
  ],
  bot_2: [
    {
      id: "msg_2_1",
      telegramMessageId: "201",
      botId: "bot_2",
      direction: "outgoing",
      text: "Summarize and format the following text: Telegram is an globally accessible cloud-based instant messaging service.",
      entities: [],
      sentByInternalUser: { id: "user_member", displayName: "Sarah Chen" },
      status: "sent",
      createdAt: new Date(Date.now() - 1200000).toISOString(),
    },
    {
      id: "msg_2_2",
      telegramMessageId: "202",
      botId: "bot_2",
      direction: "incoming",
      text: "Here is the summary in markdown format:\n\nTelegram features:\n- Cloud-based: access from any device.\n- Globally accessible: instant messaging.\n\nRead more details on Wikipedia.",
      entities: [
        { type: "bold", offsetUtf16: 41, lengthUtf16: 18 },
        { type: "italic", offsetUtf16: 61, lengthUtf16: 27 },
        { type: "underline", offsetUtf16: 92, lengthUtf16: 19 },
        { type: "text_link", offsetUtf16: 129, lengthUtf16: 17, url: "https://wikipedia.org/wiki/Telegram" },
      ],
      status: "received",
      createdAt: new Date(Date.now() - 600000).toISOString(),
    },
  ],
  bot_3: [
    {
      id: "msg_3_1",
      telegramMessageId: "301",
      botId: "bot_3",
      direction: "outgoing",
      text: "Create a photorealistic server room with modern networking racks, glassmorphic HUD panel, HSL tailored glowing indicator lights, extremely clean and sleek.",
      entities: [],
      sentByInternalUser: mockInternalUser,
      status: "sent",
      createdAt: new Date(Date.now() - 500000).toISOString(),
    },
    {
      id: "msg_3_2",
      telegramMessageId: "302",
      botId: "bot_3",
      direction: "incoming",
      text: "Grid generation complete. Here is the rendering:",
      entities: [{ type: "blockquote", offsetUtf16: 0, lengthUtf16: 25 }],
      media: [
        {
          kind: "photo",
          fileId: "file_photo_01",
          thumbnailUrl: "https://picsum.photos/seed/tg2web_photo/300/200",
          width: 1200,
          height: 800,
        },
      ],
      inlineKeyboard: {
        inline_keyboard: [
          [
            { text: "U1", callback_data: "upscale_1" },
            { text: "U2", callback_data: "upscale_2" },
            { text: "U3", callback_data: "upscale_3" },
            { text: "U4", callback_data: "upscale_4" },
          ],
          [
            { text: "V1", callback_data: "vary_1" },
            { text: "V2", callback_data: "vary_2" },
            { text: "V3", callback_data: "vary_3" },
            { text: "V4", callback_data: "vary_4" },
          ],
          [
            { text: "Web View ↗", url: "https://midjourney.com" }
          ]
        ],
      },
      status: "received",
      createdAt: new Date(Date.now() - 400000).toISOString(),
    },
  ],
  bot_4: [
    {
      id: "msg_4_1",
      telegramMessageId: "401",
      botId: "bot_4",
      direction: "incoming",
      text: "Sticker payload and sound file shared by team administrator:",
      entities: [{ type: "italic", offsetUtf16: 0, lengthUtf16: 59 }],
      media: [
        {
          kind: "sticker",
          fileId: "file_sticker_01",
          emoji: "👍",
          thumbnailUrl: "https://picsum.photos/seed/tgsticker/128/128",
        },
        {
          kind: "voice",
          fileId: "file_voice_01",
          durationSec: 45,
          waveform: Array.from({ length: 30 }, () => Math.floor(Math.random() * 100)),
        },
      ],
      status: "received",
      createdAt: new Date(Date.now() - 1000000).toISOString(),
    },
    {
      id: "msg_4_2",
      telegramMessageId: "402",
      botId: "bot_4",
      direction: "incoming",
      text: "Document attachments:",
      entities: [{ type: "bold", offsetUtf16: 0, lengthUtf16: 21 }],
      media: [
        {
          kind: "document",
          fileId: "file_doc_01",
          fileName: "Trellis_Workflow_Guidelines.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1548200,
        },
      ],
      status: "received",
      createdAt: new Date(Date.now() - 800000).toISOString(),
    },
    {
      id: "msg_4_3",
      telegramMessageId: "403",
      botId: "bot_4",
      direction: "incoming",
      text: "Animation and Video previews:",
      entities: [],
      media: [
        {
          kind: "animation",
          fileId: "file_anim_01",
          thumbnailUrl: "https://picsum.photos/seed/tganim/200/200",
          durationSec: 5,
        },
        {
          kind: "video",
          fileId: "file_video_01",
          thumbnailUrl: "https://picsum.photos/seed/tgvideo/320/180",
          durationSec: 120,
          width: 640,
          height: 360,
        },
      ],
      status: "received",
      createdAt: new Date(Date.now() - 600000).toISOString(),
    },
  ],
  bot_5: [],
};

const mockDownloads: DownloadItem[] = [
  {
    id: "dl_1",
    fileId: "file_doc_01",
    messageId: "msg_4_2",
    fileName: "Trellis_Workflow_Guidelines.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1548200,
    downloadedBytes: 1548200,
    status: "ready",
    proxyUrl: "/api/files/file_doc_01/proxy",
  },
];

let mockSettings: Settings = {
  sharedAccountPhone: "+86 188 **** 8888",
  sharedAccountStatus: "connected",
  tdlibStatus: "running",
  retentionDays: 30,
  debugMode: true,
};

// Event Subscriptions
const eventListeners = new Set<(event: AppEvent) => void>();

export const mockEmitEvent = (event: AppEvent) => {
  eventListeners.forEach((listener) => listener(event));
};

export const mockApiClient: ApiClient = {
  async getHealth() {
    return { status: "ok" };
  },

  async getMe() {
    return mockInternalUser;
  },

  async getBots() {
    return [...mockBots];
  },

  async getMessages(botId: string, before?: string, limit = 50) {
    const list = mockMessages[botId] || [];
    if (!before) {
      return list.slice(-limit);
    }
    const idx = list.findIndex((m) => m.id === before);
    if (idx === -1) return [];
    return list.slice(Math.max(0, idx - limit), idx);
  },

  async sendMessage(botId: string, request: SendMessageRequest) {
    const newMsg: ChatMessage = {
      id: `msg_client_${Date.now()}`,
      botId,
      direction: "outgoing",
      text: request.text,
      entities: request.entities || [],
      sentByInternalUser: mockInternalUser,
      status: "pending",
      createdAt: new Date().toISOString(),
      replyToMessageId: request.replyToMessageId,
      rawAvailable: true,
    };

    if (!mockMessages[botId]) {
      mockMessages[botId] = [];
    }
    mockMessages[botId].push(newMsg);

    // Simulate Network ACK
    setTimeout(() => {
      newMsg.status = "sent";
      newMsg.telegramMessageId = `tg_${Math.floor(Math.random() * 100000)}`;
      mockEmitEvent({
        eventId: `ev_${Date.now()}_ack`,
        botId,
        occurredAt: new Date().toISOString(),
        type: "message.send_ack",
        clientRequestId: request.clientRequestId,
        messageId: newMsg.id,
      });
      // also notify clients that message has updated state
      mockEmitEvent({
        eventId: `ev_${Date.now()}_new`,
        botId,
        occurredAt: new Date().toISOString(),
        type: "message.new",
        message: { ...newMsg },
      });
    }, 1000);

    return newMsg;
  },

  async uploadFile(botId: string, file: File) {
    return {
      fileId: `file_uploaded_${Date.now()}`,
      fileName: file.name,
      sizeBytes: file.size,
    };
  },

  async getDownloads() {
    return [...mockDownloads];
  },

  async getDownload(downloadId: string) {
    const dl = mockDownloads.find((d) => d.id === downloadId);
    if (!dl) throw new Error("Not found");
    return dl;
  },

  async triggerDownload(fileId: string, messageId?: string, fileName?: string, sizeBytes?: number) {
    const existing = mockDownloads.find((d) => d.fileId === fileId);
    if (existing) return existing;

    const newDl: DownloadItem = {
      id: `dl_${Date.now()}`,
      fileId,
      messageId,
      fileName: fileName || "telegram_file.bin",
      mimeType: "application/octet-stream",
      sizeBytes: sizeBytes || 1024 * 1024 * 5, // 5MB default mock
      downloadedBytes: 0,
      status: "queued",
    };

    mockDownloads.push(newDl);

    // Notify of new download
    mockEmitEvent({
      eventId: `ev_${Date.now()}_dl_init`,
      occurredAt: new Date().toISOString(),
      type: "download.progress",
      download: { ...newDl },
    });

    // Start progress simulation
    setTimeout(() => {
      simulateDownloadProgress(newDl.id);
    }, 500);

    return newDl;
  },

  async getSettings() {
    return { ...mockSettings };
  },

  async updateSettings(settings: Partial<Settings>) {
    mockSettings = { ...mockSettings, ...settings };
    return { ...mockSettings };
  },

  subscribeToEvents(onEvent: (event: AppEvent) => void) {
    eventListeners.add(onEvent);
    return () => {
      eventListeners.delete(onEvent);
    };
  },
};

// --- SIMULATION TRIGGERS ---

// 1. Simulates download progress step by step
function simulateDownloadProgress(dlId: string) {
  const dlIdx = mockDownloads.findIndex((d) => d.id === dlId);
  if (dlIdx === -1) return;
  const dl = mockDownloads[dlIdx];

  dl.status = "downloading";
  const total = dl.sizeBytes || 5 * 1024 * 1024;
  let downloaded = 0;

  const interval = setInterval(() => {
    downloaded += Math.floor(total * 0.15 + Math.random() * total * 0.05);
    if (downloaded >= total) {
      downloaded = total;
      dl.downloadedBytes = total;
      dl.status = "ready";
      dl.proxyUrl = `/api/files/${dl.fileId}/proxy`;
      clearInterval(interval);

      mockEmitEvent({
        eventId: `ev_${Date.now()}_dl_ready`,
        occurredAt: new Date().toISOString(),
        type: "download.ready",
        download: { ...dl },
      });
    } else {
      dl.downloadedBytes = downloaded;
      mockEmitEvent({
        eventId: `ev_${Date.now()}_dl_progress`,
        occurredAt: new Date().toISOString(),
        type: "download.progress",
        download: { ...dl },
      });
    }
  }, 400);
}

// 2. Simulates an incoming LLM bot draft streaming and finalization
export function simulateDraftStream(botId: string) {
  const draftId = `draft_${Date.now()}`;
  const steps = [
    "Thinking...",
    "Analyzing context and fetching metadata...",
    "Here is the translation of the requested document:\n\n**Telegram** is an internationally popular, cloud-based _instant messaging service_ that allows users to send media, messages, and files of arbitrary size.",
    "Translation completed successfully. You can download the full output archive via /download_all. Let me know if you need other formats!",
  ];

  const entitiesList: TelegramEntity[][] = [
    [],
    [],
    [
      { type: "bold", offsetUtf16: 51, lengthUtf16: 12 },
      { type: "italic", offsetUtf16: 94, lengthUtf16: 23 },
    ],
    [
      { type: "code", offsetUtf16: 82, lengthUtf16: 13 }
    ],
  ];

  let currentStep = 0;

  const interval = setInterval(() => {
    if (currentStep < steps.length - 1) {
      const draft = {
        id: `draft_item_${draftId}`,
        botId,
        draftId,
        text: steps[currentStep],
        entities: entitiesList[currentStep],
        receivedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      mockEmitEvent({
        eventId: `ev_${Date.now()}_draft_${currentStep}`,
        botId,
        occurredAt: new Date().toISOString(),
        type: "draft.pending",
        draft,
      });
      currentStep++;
    } else {
      clearInterval(interval);
      // Finalize draft
      const finalMessageId = `msg_final_${Date.now()}`;
      const finalMsg: ChatMessage = {
        id: finalMessageId,
        telegramMessageId: `tg_final_${Math.floor(Math.random() * 100000)}`,
        botId,
        direction: "incoming",
        text: steps[steps.length - 1],
        entities: entitiesList[entitiesList.length - 1],
        status: "received",
        createdAt: new Date().toISOString(),
      };

      if (!mockMessages[botId]) mockMessages[botId] = [];
      mockMessages[botId].push(finalMsg);

      // Emit draft finalized and message new
      mockEmitEvent({
        eventId: `ev_${Date.now()}_draft_final`,
        botId,
        occurredAt: new Date().toISOString(),
        type: "draft.finalized",
        draftId,
        finalMessageId,
      });

      mockEmitEvent({
        eventId: `ev_${Date.now()}_msg_new`,
        botId,
        occurredAt: new Date().toISOString(),
        type: "message.new",
        message: finalMsg,
      });
    }
  }, 1500);
}

// 3. Simulates a draft that expires / gets cancelled
export function simulateDraftExpiry(botId: string) {
  const draftId = `draft_exp_${Date.now()}`;
  const draft = {
    id: `draft_item_${draftId}`,
    botId,
    draftId,
    text: "Analyzing security patterns... [This draft will expire]",
    entities: [],
    receivedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3000).toISOString(),
  };

  mockEmitEvent({
    eventId: `ev_${Date.now()}_draft_exp_start`,
    botId,
    occurredAt: new Date().toISOString(),
    type: "draft.pending",
    draft,
  });

  setTimeout(() => {
    mockEmitEvent({
      eventId: `ev_${Date.now()}_draft_expired`,
      botId,
      occurredAt: new Date().toISOString(),
      type: "draft.expired",
      draftId,
    });
  }, 3000);
}

// 4. Simulates editing an existing message
export function simulateMessageEdit(botId: string) {
  const list = mockMessages[botId] || [];
  const editableMsg = list.find((m) => m.direction === "incoming" && m.status !== "deleted");
  if (!editableMsg) return;

  const originalText = editableMsg.text;
  editableMsg.text = `${originalText} (EDITED: Verified by compliance audit at ${new Date().toLocaleTimeString()})`;
  editableMsg.status = "edited";
  editableMsg.editedAt = new Date().toISOString();

  mockEmitEvent({
    eventId: `ev_${Date.now()}_edit`,
    botId,
    occurredAt: new Date().toISOString(),
    type: "message.edited",
    message: { ...editableMsg },
  });
}

// 5. Simulates a failed outgoing message send
export function simulateFailedSend(botId: string) {
  const clientRequestId = `req_fail_${Date.now()}`;
  const failedMsg: ChatMessage = {
    id: `msg_fail_${Date.now()}`,
    botId,
    direction: "outgoing",
    text: "Simulating a command that fails validation on Telegram...",
    entities: [],
    sentByInternalUser: mockInternalUser,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  if (!mockMessages[botId]) mockMessages[botId] = [];
  mockMessages[botId].push(failedMsg);

  // Emit event to interface
  mockEmitEvent({
    eventId: `ev_${Date.now()}_fail_init`,
    botId,
    occurredAt: new Date().toISOString(),
    type: "message.new",
    message: { ...failedMsg },
  });

  setTimeout(() => {
    failedMsg.status = "failed";
    mockEmitEvent({
      eventId: `ev_${Date.now()}_fail_ack`,
      botId,
      occurredAt: new Date().toISOString(),
      type: "message.send_failed",
      clientRequestId,
      error: "Telegram API Error (400): CHAT_ADMIN_REQUIRED - The bot must be an administrator in the channel.",
    });

    mockEmitEvent({
      eventId: `ev_${Date.now()}_fail_update`,
      botId,
      occurredAt: new Date().toISOString(),
      type: "message.edited",
      message: { ...failedMsg },
    });
  }, 1200);
}

// 6. Simulates connection status toggle
export function simulateConnectionStatusToggle() {
  const statuses: Array<"offline" | "connecting" | "reconnecting" | "connected"> = [
    "offline",
    "connecting",
    "reconnecting",
    "connected"
  ];
  let idx = 0;

  const interval = setInterval(() => {
    mockEmitEvent({
      eventId: `ev_${Date.now()}_conn_${statuses[idx]}`,
      occurredAt: new Date().toISOString(),
      type: "connection.status",
      status: statuses[idx],
      detail: idx === 0 ? "TDLib connection closed by server" : undefined,
    });
    idx++;
    if (idx >= statuses.length) {
      clearInterval(interval);
    }
  }, 1000);
}
