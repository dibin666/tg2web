import React from "react";
import { useApp } from "../context/AppContext";
import { Settings, Shield, ToggleLeft, ToggleRight } from "lucide-react";

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, connectionStatus } = useApp();

  if (!settings) return null;

  const handleRetentionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({ retentionDays: parseInt(e.target.value) });
  };

  const toggleDebug = () => {
    updateSettings({ debugMode: !settings.debugMode });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-chat)",
        padding: "24px",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "24px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: "700", color: "white", display: "flex", alignItems: "center", gap: "8px" }}>
          <Settings size={20} style={{ color: "var(--accent-blue)" }} />
          <span>Portal Settings & Gateway Status</span>
        </h1>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "6px", lineHeight: "1.4" }}>
          Configure connection endpoints, database message retention policies, and monitor TDLib subsystem status.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }} className="settings-grid">
        {/* Left Column: Connection Details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* TDLib Subsystem Status */}
          <div
            style={{
              backgroundColor: "var(--bg-sidebar)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <h3 style={{ fontSize: "0.85rem", fontWeight: "700", color: "white", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
              TDLIB CONTROLLER STATUS
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.8rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Process Status:</span>
                <span style={{ color: "var(--accent-green)", fontWeight: "bold" }}>RUNNING (PID: 8840)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>WebSocket Gateway:</span>
                <span style={{ color: connectionStatus === "connected" ? "var(--accent-green)" : "var(--accent-red)", fontWeight: "bold" }}>
                  {connectionStatus.toUpperCase()}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Shared Phone:</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "white" }}>{settings.sharedAccountPhone}</span>
              </div>
            </div>
          </div>

          {/* Credentials Scaffolding */}
          <div
            style={{
              backgroundColor: "var(--bg-sidebar)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <h3 style={{ fontSize: "0.85rem", fontWeight: "700", color: "white", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
              TELEGRAM API CREDENTIALS
            </h3>
            <div className="settings-group">
              <label>API ID (Telegram app-developer console)</label>
              <input
                type="text"
                disabled
                value="2847192"
                className="settings-input"
                style={{ opacity: 0.6, cursor: "not-allowed", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <div className="settings-group" style={{ marginBottom: "0" }}>
              <label>API Hash (Protected Secret Key)</label>
              <input
                type="password"
                disabled
                value="9f8a37b6c5d4e3f2a1b0c9d8e7f6a5b4"
                className="settings-input"
                style={{ opacity: 0.6, cursor: "not-allowed", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "8px", display: "block" }}>
              * Secrets are configured via backend environment parameters. Editing is locked.
            </span>
          </div>
        </div>

        {/* Right Column: Policies & Debug */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Audit Notification Info */}
          <div
            style={{
              backgroundColor: "rgba(245, 158, 11, 0.03)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              padding: "16px",
              display: "flex",
              gap: "10px",
              fontSize: "0.75rem",
              lineHeight: "1.5",
              color: "var(--text-secondary)",
            }}
          >
            <Shield size={20} style={{ color: "var(--accent-yellow)", flexShrink: 0 }} />
            <div>
              <strong>Audit Policy Alert</strong>: This portal provides shared team-wide access to client conversations. All outgoing commands are audited with internal user stamps. Do not share login invite credentials outside your authorized ops team.
            </div>
          </div>

          {/* Retention & DB policies */}
          <div
            style={{
              backgroundColor: "var(--bg-sidebar)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <h3 style={{ fontSize: "0.85rem", fontWeight: "700", color: "white", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
              DATA RETENTION POLICIES
            </h3>
            <div className="settings-group">
              <label>Database Message Retention Period</label>
              <select
                value={settings.retentionDays}
                onChange={handleRetentionChange}
                className="settings-input"
                style={{ cursor: "pointer", appearance: "auto" }}
              >
                <option value={7}>7 Days (Compliance strict)</option>
                <option value={30}>30 Days (Standard default)</option>
                <option value={90}>90 Days (Extended cache)</option>
                <option value={0}>Permanent (Audit history)</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px" }}>
              <div>
                <div style={{ fontSize: "0.8rem", color: "white", fontWeight: "600" }}>Local File Caching</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Store downloads locally on server disk
                </div>
              </div>
              <span style={{ color: "var(--accent-green)", display: "flex" }}>
                <ToggleRight size={32} style={{ cursor: "pointer" }} />
              </span>
            </div>
          </div>

          {/* Debug toggles */}
          <div
            style={{
              backgroundColor: "var(--bg-sidebar)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <h3 style={{ fontSize: "0.85rem", fontWeight: "700", color: "white", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
              DEVELOPER OPTIONS
            </h3>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "0.8rem", color: "white", fontWeight: "600" }}>Developer Debug Mode</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Exposes WebSocket simulator decks and log feeds
                </div>
              </div>
              <button onClick={toggleDebug} style={{ color: settings.debugMode ? "var(--accent-blue)" : "var(--text-muted)", cursor: "pointer", display: "flex" }}>
                {settings.debugMode ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .settings-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
};
