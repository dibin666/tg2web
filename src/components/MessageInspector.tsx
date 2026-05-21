import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { X, Eye, Code, Calendar, User, Shield, Info, Database } from "lucide-react";

export const MessageInspector: React.FC = () => {
  const { selectedMessage, setSelectedMessage } = useApp();
  const [viewMode, setViewMode] = useState<"details" | "json">("details");

  if (!selectedMessage) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          height: "100%",
          color: "var(--text-muted)",
          textAlign: "center",
        }}
      >
        <Info size={36} style={{ marginBottom: "12px", opacity: 0.5 }} />
        <h4 style={{ color: "var(--text-secondary)", fontSize: "0.95rem", fontWeight: "600", marginBottom: "6px" }}>
          Metadata Inspector
        </h4>
        <p style={{ fontSize: "0.75rem", lineHeight: "1.5" }}>
          Select any message in the chat thread to inspect database audit IDs, Telegram IDs, styled entities, media parameters, and raw WebSocket JSON.
        </p>
      </div>
    );
  }

  const m = selectedMessage;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-sidebar)",
        borderLeft: "1px solid var(--border-color)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Database size={14} style={{ color: "var(--accent-blue-hover)" }} />
          <h3 style={{ fontSize: "0.85rem", fontWeight: "700", letterSpacing: "0.05em", color: "var(--text-primary)" }}>
            INSPECT MESSAGE
          </h3>
        </div>
        <button
          onClick={() => setSelectedMessage(null)}
          style={{
            cursor: "pointer",
            color: "var(--text-secondary)",
            padding: "4px",
            borderRadius: "4px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-color)",
          backgroundColor: "rgba(0,0,0,0.15)",
        }}
      >
        <button
          onClick={() => setViewMode("details")}
          style={{
            flex: 1,
            padding: "10px",
            fontSize: "0.75rem",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            color: viewMode === "details" ? "var(--accent-blue-hover)" : "var(--text-secondary)",
            borderBottom: viewMode === "details" ? "2px solid var(--accent-blue)" : "none",
            backgroundColor: viewMode === "details" ? "rgba(255,255,255,0.02)" : "transparent",
          }}
        >
          <Eye size={12} />
          <span>Audit Details</span>
        </button>
        <button
          onClick={() => setViewMode("json")}
          style={{
            flex: 1,
            padding: "10px",
            fontSize: "0.75rem",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            color: viewMode === "json" ? "var(--accent-blue-hover)" : "var(--text-secondary)",
            borderBottom: viewMode === "json" ? "2px solid var(--accent-blue)" : "none",
            backgroundColor: viewMode === "json" ? "rgba(255,255,255,0.02)" : "transparent",
          }}
        >
          <Code size={12} />
          <span>Raw JSON</span>
        </button>
      </div>

      {/* Pane Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {viewMode === "details" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* IDs Card */}
            <div style={{ backgroundColor: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
              <h4 style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "700", marginBottom: "8px" }}>IDENTIFIERS</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Audit ID:</span>
                  <span style={{ color: "var(--text-primary)" }}>{m.id}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Telegram ID:</span>
                  <span style={{ color: m.telegramMessageId ? "var(--accent-blue-hover)" : "var(--accent-red)" }}>
                    {m.telegramMessageId || "Unassigned (Failed/Pending)"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Bot ID:</span>
                  <span>{m.botId}</span>
                </div>
              </div>
            </div>

            {/* Attribution */}
            <div style={{ backgroundColor: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
              <h4 style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "700", marginBottom: "8px" }}>ATTRIBUTION</h4>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem" }}>
                {m.direction === "outgoing" ? (
                  <>
                    <Shield size={14} style={{ color: "var(--accent-blue)" }} />
                    <div>
                      <div style={{ fontWeight: "600", color: "white" }}>
                        {m.sentByInternalUser?.displayName || "System Automator"}
                      </div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        Internal User ID: {m.sentByInternalUser?.id || "N/A"}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <User size={14} style={{ color: "var(--accent-green)" }} />
                    <div>
                      <div style={{ fontWeight: "600", color: "white" }}>Telegram Third-Party Bot</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>External incoming webhook response</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Timestamps & Status */}
            <div style={{ backgroundColor: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)", fontSize: "0.75rem" }}>
              <h4 style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "700", marginBottom: "8px" }}>STATUS & HISTORY</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Direction:</span>
                  <span style={{ textTransform: "capitalize" }}>{m.direction}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Sync Status:</span>
                  <span
                    style={{
                      textTransform: "uppercase",
                      color:
                        m.status === "received" || m.status === "sent"
                          ? "var(--accent-green)"
                          : m.status === "failed"
                          ? "var(--accent-red)"
                          : "var(--accent-yellow)",
                      fontWeight: "bold",
                    }}
                  >
                    {m.status}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "4px" }}>
                  <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "2px" }}><Calendar size={10} /> Created:</span>
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                {m.editedAt && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "4px" }}>
                    <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "2px" }}><Calendar size={10} /> Edited:</span>
                    <span>{new Date(m.editedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Entities Analysis */}
            <div style={{ backgroundColor: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
              <h4 style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "700", marginBottom: "8px" }}>
                TELEGRAM ENTITIES ({m.entities.length})
              </h4>
              {m.entities.length === 0 ? (
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>No styled entities found in text.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {m.entities.map((ent, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "6px 8px",
                        backgroundColor: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        borderRadius: "4px",
                        fontSize: "0.7rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                        <span style={{ fontWeight: "bold", color: "var(--accent-blue-hover)" }}>{ent.type}</span>
                        <span style={{ color: "var(--text-muted)" }}>
                          offset: {ent.offsetUtf16}, len: {ent.lengthUtf16}
                        </span>
                      </div>
                      {ent.url && (
                        <div style={{ color: "var(--text-muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          url: <a href={ent.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.65rem" }}>{ent.url}</a>
                        </div>
                      )}
                      {ent.language && (
                        <div style={{ color: "var(--text-muted)" }}>language: {ent.language}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Media Metadata */}
            {m.media && m.media.length > 0 && (
              <div style={{ backgroundColor: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                <h4 style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "700", marginBottom: "8px" }}>
                  MEDIA OBJECTS ({m.media.length})
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {m.media.map((med, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "8px",
                        backgroundColor: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        borderRadius: "4px",
                        fontSize: "0.7rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: "bold", textTransform: "uppercase" }}>{med.kind}</span>
                        {"fileId" in med && <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.65rem" }}>{med.fileId}</span>}
                      </div>
                      {med.kind === "photo" && (
                        <div style={{ color: "var(--text-muted)" }}>Dimensions: {med.width}x{med.height}</div>
                      )}
                      {med.kind === "video" && (
                        <div style={{ color: "var(--text-muted)" }}>
                          Dimensions: {med.width}x{med.height} | Duration: {med.durationSec}s
                        </div>
                      )}
                      {med.kind === "voice" && (
                        <div style={{ color: "var(--text-muted)" }}>
                          Duration: {med.durationSec}s | Waveform samples: {med.waveform?.length}
                        </div>
                      )}
                      {med.kind === "document" && (
                        <div style={{ color: "var(--text-muted)" }}>
                          Filename: {med.fileName} | Mime: {med.mimeType} | Size: {med.sizeBytes} B
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              padding: "10px",
              backgroundColor: "rgba(0,0,0,0.3)",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "#34d399",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              overflowX: "auto",
            }}
          >
            {JSON.stringify(m, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};
