import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { mockApiClient, simulateDraftStream, simulateDraftExpiry, simulateMessageEdit, simulateFailedSend, simulateConnectionStatusToggle } from "../api/mock";
import { BotSummary, ChatMessage, PendingDraft, DownloadItem, Settings, AppEvent } from "../api/types";

interface AppContextType {
  bots: BotSummary[];
  messages: ChatMessage[];
  pendingDrafts: PendingDraft[];
  downloads: DownloadItem[];
  connectionStatus: "connecting" | "connected" | "reconnecting" | "offline";
  activeBotId: string | null;
  selectedMessage: ChatMessage | null;
  eventLog: AppEvent[];
  settings: Settings | null;
  loading: boolean;
  
  selectBot: (botId: string) => void;
  sendMessage: (text: string, replyToMessageId?: string) => Promise<void>;
  downloadMedia: (fileId: string, messageId?: string, fileName?: string, sizeBytes?: number) => Promise<void>;
  setSelectedMessage: (msg: ChatMessage | null) => void;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  clearEventLog: () => void;
  triggerSimulation: (type: "draft_stream" | "draft_expiry" | "msg_edit" | "failed_send" | "connection") => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({});
  const [pendingDrafts, setPendingDrafts] = useState<PendingDraft[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "reconnecting" | "offline">("connected");
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessageState] = useState<ChatMessage | null>(null);
  const [eventLog, setEventLog] = useState<AppEvent[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch initial data
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const botsList = await mockApiClient.getBots();
        setBots(botsList);
        
        // Load initial messages for all bots
        const msgs: Record<string, ChatMessage[]> = {};
        for (const bot of botsList) {
          msgs[bot.id] = await mockApiClient.getMessages(bot.id);
        }
        setMessagesMap(msgs);

        const dls = await mockApiClient.getDownloads();
        setDownloads(dls);

        const sets = await mockApiClient.getSettings();
        setSettings(sets);

        // Auto select first bot
        if (botsList.length > 0) {
          setActiveBotId(botsList[0].id);
        }
      } catch (e) {
        console.error("Failed to initialize mock client data", e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Listen to WebSocket mock events
  useEffect(() => {
    const unsubscribe = mockApiClient.subscribeToEvents((event: AppEvent) => {
      // Append to raw Event Log Panel
      setEventLog((prev) => [event, ...prev].slice(0, 100)); // limit to 100 events

      const botId = event.botId;

      switch (event.type) {
        case "connection.status":
          setConnectionStatus(event.status);
          break;

        case "message.new":
          if (botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              // Avoid duplicates
              const exists = currentList.some((m) => m.id === event.message.id);
              const updatedList = exists
                ? currentList.map((m) => (m.id === event.message.id ? event.message : m))
                : [...currentList, event.message];

              return { ...prev, [botId]: updatedList };
            });

            // Update bot summary preview & unread count
            setBots((prevBots) =>
              prevBots.map((b) => {
                if (b.id === botId) {
                  return {
                    ...b,
                    lastMessagePreview: event.message.text || "[Media/Attachment]",
                    unreadCount: activeBotId === botId ? 0 : b.unreadCount + (event.message.direction === "incoming" ? 1 : 0),
                  };
                }
                return b;
              })
            );
          }
          break;

        case "message.edited":
          if (botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              const updatedList = currentList.map((m) =>
                m.id === event.message.id ? event.message : m
              );
              return { ...prev, [botId]: updatedList };
            });

            // Sync with Inspector if selected
            setSelectedMessageState((prevSelected) => {
              if (prevSelected && prevSelected.id === event.message.id) {
                return event.message;
              }
              return prevSelected;
            });
          }
          break;

        case "message.deleted":
          if (botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              const updatedList = currentList.map((m) =>
                m.id === event.messageId ? { ...m, status: "deleted" as const, text: "[Message deleted]" } : m
              );
              return { ...prev, [botId]: updatedList };
            });
          }
          break;

        case "message.send_ack":
          if (botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              return {
                ...prev,
                [botId]: currentList.map((m) =>
                  m.id === event.clientRequestId || m.id.startsWith("msg_client_")
                    ? { ...m, status: "sent" as const, telegramMessageId: event.messageId }
                    : m
                ),
              };
            });
          }
          break;

        case "message.send_failed":
          if (botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              return {
                ...prev,
                [botId]: currentList.map((m) =>
                  m.id.startsWith("msg_client_") // find the pending outgoing message
                    ? { ...m, status: "failed" as const }
                    : m
                ),
              };
            });
          }
          break;

        case "draft.pending":
          setPendingDrafts((prev) => {
            const filtered = prev.filter((d) => d.draftId !== event.draft.draftId);
            return [...filtered, event.draft];
          });
          break;

        case "draft.expired":
          setPendingDrafts((prev) => prev.filter((d) => d.draftId !== event.draftId));
          break;

        case "draft.finalized":
          setPendingDrafts((prev) => prev.filter((d) => d.draftId !== event.draftId));
          // Note: the final message itself arrives via message.new event
          break;

        case "download.progress":
        case "download.ready":
        case "download.failed":
          setDownloads((prev) => {
            const exists = prev.some((d) => d.id === event.download.id);
            if (exists) {
              return prev.map((d) => (d.id === event.download.id ? event.download : d));
            } else {
              return [...prev, event.download];
            }
          });
          break;

        default:
          console.warn("Unhandled WebSocket event:", event);
      }
    });

    return unsubscribe;
  }, [activeBotId]);

  // Select active bot
  const selectBot = useCallback((botId: string) => {
    setActiveBotId(botId);
    setSelectedMessageState(null); // Clear inspector
    // Mark as read
    setBots((prev) =>
      prev.map((b) => (b.id === botId ? { ...b, unreadCount: 0 } : b))
    );
  }, []);

  // Send message
  const sendMessage = useCallback(
    async (text: string, replyToMessageId?: string) => {
      if (!activeBotId || connectionStatus === "offline") return;
      
      const clientRequestId = `req_${Date.now()}`;
      await mockApiClient.sendMessage(activeBotId, {
        clientRequestId,
        text,
        replyToMessageId,
      });
    },
    [activeBotId, connectionStatus]
  );

  // Trigger media proxy download
  const downloadMedia = useCallback(
    async (fileId: string, messageId?: string, fileName?: string, sizeBytes?: number) => {
      await mockApiClient.triggerDownload(fileId, messageId, fileName, sizeBytes);
    },
    []
  );

  // Set selected message for Inspector
  const setSelectedMessage = useCallback((msg: ChatMessage | null) => {
    setSelectedMessageState(msg);
  }, []);

  // Update Settings
  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    const updated = await mockApiClient.updateSettings(newSettings);
    setSettings(updated);
  }, []);

  // Clear Event Logs
  const clearEventLog = useCallback(() => {
    setEventLog([]);
  }, []);

  // Run Mocks Live Simulations
  const triggerSimulation = useCallback(
    (type: "draft_stream" | "draft_expiry" | "msg_edit" | "failed_send" | "connection") => {
      if (!activeBotId) return;

      switch (type) {
        case "draft_stream":
          simulateDraftStream(activeBotId);
          break;
        case "draft_expiry":
          simulateDraftExpiry(activeBotId);
          break;
        case "msg_edit":
          simulateMessageEdit(activeBotId);
          break;
        case "failed_send":
          simulateFailedSend(activeBotId);
          break;
        case "connection":
          simulateConnectionStatusToggle();
          break;
      }
    },
    [activeBotId]
  );

  const activeMessages = activeBotId ? messagesMap[activeBotId] || [] : [];

  return (
    <AppContext.Provider
      value={{
        bots,
        messages: activeMessages,
        pendingDrafts: pendingDrafts.filter((d) => d.botId === activeBotId),
        downloads,
        connectionStatus,
        activeBotId,
        selectedMessage,
        eventLog,
        settings,
        loading,
        selectBot,
        sendMessage,
        downloadMedia,
        setSelectedMessage,
        updateSettings,
        clearEventLog,
        triggerSimulation,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
