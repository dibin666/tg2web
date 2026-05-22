import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Terminal, Shield, ArrowRight, Loader, User, Lock } from "lucide-react";

export const LoginPage: React.FC = () => {
  const { login, t } = useApp();
  const [activeTab, setActiveTab] = useState<"user" | "admin">("user");
  const [password, setPassword] = useState("");
  const [accessKeyInput, setAccessKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessKeyInput.trim()) {
      setError(t("pleaseInputPass"));
      return;
    }
    setLoading(true);
    setError("");

    try {
      const success = login("user", accessKeyInput.trim());
      if (await success) {
        navigate("/");
      } else {
        setError(t("invalidKeyError"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError(t("pleaseInputPass"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const success = login("admin", password.trim());
      if (await success) {
        navigate("/");
      } else {
        setError(t("incorrectAdminPass"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        backgroundColor: "var(--bg-app)",
        padding: "20px",
      }}
      className="animate-fade-in"
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          backgroundColor: "var(--bg-sidebar)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
          padding: "32px 28px",
          boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.08)",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div
            style={{
              backgroundColor: "var(--accent-blue-transparent)",
              padding: "12px",
              borderRadius: "10px",
              color: "var(--accent-blue)",
              marginBottom: "14px",
              display: "flex",
            }}
          >
            <Terminal size={24} />
          </div>
          <h2 style={{ fontSize: "1.2rem", fontWeight: "700", color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            {t("loginTitle")}
          </h2>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
            {t("loginSub")}
          </span>
        </div>

        {/* Security Alert Warning */}
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.03)",
            border: "1px solid rgba(239, 68, 68, 0.12)",
            borderRadius: "8px",
            padding: "12px 14px",
            display: "flex",
            gap: "10px",
            fontSize: "0.7rem",
            color: "var(--accent-red)",
            lineHeight: "1.45",
          }}
        >
          <Shield size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
          <span>{t("securityWarning")}</span>
        </div>

        {/* Role Tabs Selection */}
        <div
          style={{
            display: "flex",
            backgroundColor: "var(--bg-app)",
            padding: "4px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (!loading) {
                setActiveTab("user");
                setError("");
                setPassword("");
                setAccessKeyInput("");
              }
            }}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "8px 12px",
              fontSize: "0.75rem",
              fontWeight: "600",
              borderRadius: "6px",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              backgroundColor: activeTab === "user" ? "var(--bg-sidebar)" : "transparent",
              color: activeTab === "user" ? "var(--accent-blue)" : "var(--text-secondary)",
              boxShadow: activeTab === "user" ? "0 2px 4px rgba(0, 0, 0, 0.03)" : "none",
              transition: "all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)",
            }}
          >
            <User size={14} />
            <span>{t("userAccessTab")}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!loading) {
                setActiveTab("admin");
                setError("");
                setPassword("");
                setAccessKeyInput("");
              }
            }}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "8px 12px",
              fontSize: "0.75rem",
              fontWeight: "600",
              borderRadius: "6px",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              backgroundColor: activeTab === "admin" ? "var(--bg-sidebar)" : "transparent",
              color: activeTab === "admin" ? "var(--accent-blue)" : "var(--text-secondary)",
              boxShadow: activeTab === "admin" ? "0 2px 4px rgba(0, 0, 0, 0.03)" : "none",
              transition: "all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)",
            }}
          >
            <Lock size={14} />
            <span>{t("adminTerminalTab")}</span>
          </button>
        </div>

        {/* Tab Forms */}
        {activeTab === "user" ? (
          <form onSubmit={handleUserLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="settings-group" style={{ marginBottom: "0" }}>
              <label htmlFor="access-key" style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)" }}>
                {t("accessKeyLabel")}
              </label>
              <input
                id="access-key"
                name="access-key"
                type="password"
                value={accessKeyInput}
                onChange={(e) => setAccessKeyInput(e.target.value)}
                placeholder={t("accessKeyPlaceholder")}
                autoComplete="current-password"
                disabled={loading}
                className="settings-input"
                style={{
                  fontSize: "0.85rem",
                  padding: "10px 12px",
                  borderColor: error ? "var(--accent-red)" : "var(--border-color)",
                  borderRadius: "8px",
                  marginTop: "6px",
                }}
              />
            </div>

            {error && (
              <div style={{ fontSize: "0.75rem", color: "var(--accent-red)", fontWeight: "500" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                padding: "10px 16px",
                justifyContent: "center",
                fontSize: "0.85rem",
                width: "100%",
                borderRadius: "8px",
              }}
            >
              {loading ? (
                <>
                  <Loader size={16} className="animate-pulse-slow" />
                  <span>{t("authorizing")}</span>
                </>
              ) : (
                <>
                  <span>{t("enterUserPortal")}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleAdminLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="settings-group" style={{ marginBottom: "0" }}>
              <label htmlFor="admin-password" style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)" }}>
                {t("passwordLabel")}
              </label>
              <input
                id="admin-password"
                name="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
                autoComplete="current-password"
                disabled={loading}
                className="settings-input"
                style={{
                  fontSize: "0.85rem",
                  padding: "10px 12px",
                  borderColor: error ? "var(--accent-red)" : "var(--border-color)",
                  borderRadius: "8px",
                  marginTop: "6px",
                }}
              />
            </div>

            {error && (
              <div style={{ fontSize: "0.75rem", color: "var(--accent-red)", fontWeight: "500" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                padding: "10px 16px",
                justifyContent: "center",
                fontSize: "0.85rem",
                width: "100%",
                borderRadius: "8px",
              }}
            >
              {loading ? (
                <>
                  <Loader size={16} className="animate-pulse-slow" />
                  <span>{t("authorizing")}</span>
                </>
              ) : (
                <>
                  <span>{t("loginAsAdmin")}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
