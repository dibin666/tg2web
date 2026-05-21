import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ConnectionStatus } from "./ConnectionStatus";
import { BotList } from "./BotList";
import { MessageSquare, Download, Settings, LogOut, Terminal } from "lucide-react";

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isRouteActive = (paths: string[]) => {
    return paths.includes(location.pathname) || (location.pathname === "/" && paths.includes("/bots"));
  };

  const handleLogout = () => {
    // Navigate to mock login page
    navigate("/login");
  };

  return (
    <div
      style={{
        width: "var(--sidebar-width)",
        backgroundColor: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        flexShrink: 0,
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          backgroundColor: "#0d1322",
        }}
      >
        <div style={{ backgroundColor: "var(--accent-blue)", padding: "6px", borderRadius: "6px", color: "white", display: "flex" }}>
          <Terminal size={18} />
        </div>
        <div>
          <h2 style={{ fontSize: "0.85rem", fontWeight: "700", letterSpacing: "0.05em", color: "white", lineHeight: "1.2" }}>
            TG WEB RELAY
          </h2>
          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "block" }}>
            Internal Ops Portal v1.0
          </span>
        </div>
      </div>

      {/* Connection Indicator */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-color)" }}>
        <ConnectionStatus />
      </div>

      {/* Bots list */}
      <BotList />

      {/* Footer Navigation */}
      <div
        style={{
          padding: "12px",
          borderTop: "1px solid var(--border-color)",
          backgroundColor: "rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "0.8rem",
            fontWeight: "500",
            color: isRouteActive(["/", "/bots"]) ? "white" : "var(--text-secondary)",
            backgroundColor: isRouteActive(["/", "/bots"]) ? "rgba(255,255,255,0.05)" : "transparent",
            border: `1px solid ${isRouteActive(["/", "/bots"]) ? "var(--border-color)" : "transparent"}`,
            textDecoration: "none",
          }}
        >
          <MessageSquare size={14} />
          <span>Active Conversations</span>
        </Link>

        <Link
          to="/downloads"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "0.8rem",
            fontWeight: "500",
            color: isRouteActive(["/downloads"]) ? "white" : "var(--text-secondary)",
            backgroundColor: isRouteActive(["/downloads"]) ? "rgba(255,255,255,0.05)" : "transparent",
            border: `1px solid ${isRouteActive(["/downloads"]) ? "var(--border-color)" : "transparent"}`,
            textDecoration: "none",
          }}
        >
          <Download size={14} />
          <span>Downloads History</span>
        </Link>

        <Link
          to="/settings"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "0.8rem",
            fontWeight: "500",
            color: isRouteActive(["/settings"]) ? "white" : "var(--text-secondary)",
            backgroundColor: isRouteActive(["/settings"]) ? "rgba(255,255,255,0.05)" : "transparent",
            border: `1px solid ${isRouteActive(["/settings"]) ? "var(--border-color)" : "transparent"}`,
            textDecoration: "none",
          }}
        >
          <Settings size={14} />
          <span>Portal Settings</span>
        </Link>

        <button
          onClick={handleLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "0.8rem",
            fontWeight: "500",
            color: "var(--accent-red)",
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--accent-red-transparent)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <LogOut size={14} />
          <span>Log out portal</span>
        </button>
      </div>
    </div>
  );
};
