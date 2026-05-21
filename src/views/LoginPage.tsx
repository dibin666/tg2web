import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Terminal, Shield, ArrowRight, Loader } from "lucide-react";

export const LoginPage: React.FC = () => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please input credentials");
      return;
    }

    setLoading(true);
    setError("");

    // Simulate login loading delay
    setTimeout(() => {
      setLoading(false);
      navigate("/");
    }, 1500);
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
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          backgroundColor: "var(--bg-sidebar)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          padding: "28px 24px",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "24px" }}>
          <div
            style={{
              backgroundColor: "var(--accent-blue-transparent)",
              padding: "10px",
              borderRadius: "8px",
              color: "var(--accent-blue-hover)",
              marginBottom: "12px",
              display: "flex",
            }}
          >
            <Terminal size={24} />
          </div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: "700", color: "white", letterSpacing: "0.02em" }}>
            TG Relay Operations Portal
          </h2>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
            Authorized Staff Access Only
          </span>
        </div>

        {/* Security Warning */}
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.03)",
            border: "1px solid rgba(239, 68, 68, 0.15)",
            borderRadius: "6px",
            padding: "10px 12px",
            display: "flex",
            gap: "8px",
            fontSize: "0.7rem",
            color: "var(--accent-red)",
            lineHeight: "1.4",
            marginBottom: "20px",
          }}
        >
          <Shield size={16} style={{ flexShrink: 0 }} />
          <span>
            <strong>IP MONITORING IN EFFECT</strong>: Unregistered connection attempts are recorded for auditing. Do not close this terminal during session handshakes.
          </span>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="settings-group" style={{ marginBottom: "0" }}>
            <label style={{ fontSize: "0.75rem" }}>Portal Invite Code / Admin Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter session access passphrase..."
              disabled={loading}
              className="settings-input"
              style={{
                fontSize: "0.85rem",
                padding: "10px 12px",
                borderColor: error ? "var(--accent-red)" : "var(--border-color)",
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
              marginTop: "8px",
            }}
          >
            {loading ? (
              <>
                <Loader size={16} className="animate-pulse-slow" />
                <span>Authorizing Portal Access...</span>
              </>
            ) : (
              <>
                <span>Access Terminal Dashboard</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
