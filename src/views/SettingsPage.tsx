import React from "react";
import { useApp } from "../context/AppContext";
import { Settings, Shield, ToggleLeft, ToggleRight, Key, Plus, Trash2, Copy, Check } from "lucide-react";

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, connectionStatus, t, accessKeys, generateAccessKey, revokeAccessKey } = useApp();
  
  const [newKeyName, setNewKeyName] = React.useState("");
  const [copiedKeyId, setCopiedKeyId] = React.useState<string | null>(null);

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
        <h1 style={{ fontSize: "1.2rem", fontWeight: "700", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
          <Settings size={20} style={{ color: "var(--accent-blue)" }} />
          <span>{t("settingsTitle")}</span>
        </h1>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "6px", lineHeight: "1.4" }}>
          {t("settingsDesc")}
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
            <h3 style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--text-primary)", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
              {t("tdlibStatus")}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.8rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>{t("processStatus")}</span>
                <span style={{ color: "var(--accent-green)", fontWeight: "bold" }}>RUNNING (PID: 8840)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>{t("websocketGateway")}</span>
                <span style={{ color: connectionStatus === "connected" ? "var(--accent-green)" : "var(--accent-red)", fontWeight: "bold" }}>
                  {connectionStatus.toUpperCase()}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>{t("sharedPhone")}</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{settings.sharedAccountPhone}</span>
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
            <h3 style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--text-primary)", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
              {t("tgApiCredentials")}
            </h3>
            <div className="settings-group">
              <label>{t("apiIdDesc")}</label>
              <input
                type="text"
                disabled
                value="2847192"
                className="settings-input"
                style={{ opacity: 0.6, cursor: "not-allowed", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <div className="settings-group" style={{ marginBottom: "0" }}>
              <label>{t("apiHashDesc")}</label>
              <input
                type="password"
                disabled
                value="9f8a37b6c5d4e3f2a1b0c9d8e7f6a5b4"
                className="settings-input"
                style={{ opacity: 0.6, cursor: "not-allowed", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "8px", display: "block" }}>
              {t("secretsNotice")}
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
              <strong>{t("auditPolicyAlert")}</strong>: {t("auditPolicyDesc")}
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
            <h3 style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--text-primary)", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
              {t("dataRetentionPolicies")}
            </h3>
            <div className="settings-group">
              <label>{t("dbRetentionPeriod")}</label>
              <select
                value={settings.retentionDays}
                onChange={handleRetentionChange}
                className="settings-input"
                style={{ cursor: "pointer", appearance: "auto" }}
              >
                <option value={7}>{t("retention7Days")}</option>
                <option value={30}>{t("retention30Days")}</option>
                <option value={90}>{t("retention90Days")}</option>
                <option value={0}>{t("retentionPermanent")}</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px" }}>
              <div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: "600" }}>{t("localFileCaching")}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {t("storeDownloadsLocally")}
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
            <h3 style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--text-primary)", marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
              {t("developerOptions")}
            </h3>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: "600" }}>{t("devDebugMode")}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {t("exposesDecksLogs")}
                </div>
              </div>
              <button onClick={toggleDebug} style={{ color: settings.debugMode ? "var(--accent-blue)" : "var(--text-muted)", cursor: "pointer", display: "flex" }}>
                {settings.debugMode ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* User Access Keys Management */}
      <div
        style={{
          marginTop: "24px",
          backgroundColor: "var(--bg-sidebar)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <h3 style={{ fontSize: "0.9rem", fontWeight: "700", color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
          <Key size={18} style={{ color: "var(--accent-blue)" }} />
          <span>{t("keyMgmtTitle")}</span>
        </h3>

        {/* Generate Key Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newKeyName.trim()) {
              generateAccessKey(newKeyName.trim());
              setNewKeyName("");
            }
          }}
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder={t("keyNamePlaceholder")}
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="settings-input"
            style={{
              flex: 1,
              maxWidth: "400px",
              margin: 0,
            }}
          />
          <button
            type="submit"
            disabled={!newKeyName.trim()}
            style={{
              backgroundColor: newKeyName.trim() ? "var(--accent-blue)" : "var(--text-muted)",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              padding: "8px 16px",
              fontSize: "0.8rem",
              fontWeight: "600",
              cursor: newKeyName.trim() ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "background-color 0.2s",
            }}
          >
            <Plus size={16} />
            <span>{t("generateKeyBtn")}</span>
          </button>
        </form>

        {/* Access Keys Table */}
        {accessKeys.length === 0 ? (
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "16px 0" }}>
            No access keys generated.
          </div>
        ) : (
          <div
            style={{
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <th style={{ padding: "10px 14px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colKeyName")}
                  </th>
                  <th style={{ padding: "10px 14px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colKeySecret")}
                  </th>
                  <th style={{ padding: "10px 14px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc" }}>
                    {t("colLastLogin")}
                  </th>
                  <th style={{ padding: "10px 14px", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", backgroundColor: "#f8fafc", textAlign: "right" }}>
                    {t("revokeBtn")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {accessKeys.map((keyObj) => (
                  <tr
                    key={keyObj.id}
                    style={{ borderBottom: "1px solid var(--border-color)", transition: "background-color 0.15s ease" }}
                    className="table-row-hover"
                  >
                    <td style={{ padding: "10px 14px", fontSize: "0.8rem", fontWeight: "600", color: "var(--text-primary)" }}>
                      {keyObj.name}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: "0.8rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", backgroundColor: "rgba(0,0,0,0.03)", padding: "2px 6px", borderRadius: "4px" }}>
                          {keyObj.key}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(keyObj.key);
                            setCopiedKeyId(keyObj.id);
                            setTimeout(() => setCopiedKeyId(null), 2000);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            padding: "4px",
                            cursor: "pointer",
                            color: copiedKeyId === keyObj.id ? "var(--accent-green)" : "var(--text-muted)",
                            display: "flex",
                            alignItems: "center",
                          }}
                          title="Copy key"
                        >
                          {copiedKeyId === keyObj.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {keyObj.lastLoginAt ? new Date(keyObj.lastLoginAt).toLocaleString() : t("neverLogin")}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <button
                        onClick={() => revokeAccessKey(keyObj.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--accent-red)",
                          padding: "4px",
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                        title="Revoke Access Key"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .settings-grid {
            grid-template-columns: 1fr !important;
          }
        }
        .table-row-hover:hover td {
          background-color: #f8fafc !important;
        }
      `}</style>
    </div>
  );
};
