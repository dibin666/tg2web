import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BotList } from "./BotList";
import { useApp } from "../context/AppContext";
import { MessageSquare, Settings, LogOut, Terminal, FolderOpen, HardDriveDownload } from "lucide-react";

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceFiles, connectionStatus, userRole, logout, t } = useApp();

  const pendingCount = workspaceFiles.filter((f) => f.status === "pending").length;

  const isRouteActive = (paths: string[]) => {
    return paths.includes(location.pathname) || (location.pathname === "/" && paths.includes("/bots"));
  };

  const handleLogout = () => {
    logout();
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
          backgroundColor: "var(--bg-sidebar)",
        }}
      >
        <div style={{ backgroundColor: "var(--accent-blue)", padding: "6px", borderRadius: "6px", color: "white", display: "flex" }}>
          <Terminal size={18} />
        </div>
        <div>
          <h2 style={{ fontSize: "0.85rem", fontWeight: "700", letterSpacing: "0.05em", color: "var(--text-primary)", lineHeight: "1.2", display: "flex", alignItems: "center", gap: "6px" }}>
            TG WEB RELAY
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor:
                  connectionStatus === "connected"
                    ? "var(--accent-green)"
                    : connectionStatus === "offline"
                    ? "var(--accent-red)"
                    : "var(--accent-yellow)",
                display: "inline-block",
              }}
              title={`Gateway: ${connectionStatus}`}
            />
          </h2>
          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "block" }}>
            {t("internalOps")} v1.0
          </span>
        </div>
      </div>

      {/* Bots list */}
      <BotList />

      {/* Footer Navigation */}
      <div
        style={{
          padding: "10px",
          borderTop: "1px solid var(--border-color)",
          backgroundColor: "var(--bg-sidebar)",
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            color: isRouteActive(["/", "/bots"]) ? "var(--accent-blue)" : "var(--text-secondary)",
            backgroundColor: isRouteActive(["/", "/bots"]) ? "var(--accent-blue-transparent)" : "transparent",
            transition: "all 0.2s ease",
          }}
          title={t("chatsTooltip")}
        >
          <MessageSquare size={18} />
        </Link>

        <Link
          to="/workspace"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            color: isRouteActive(["/workspace"]) ? "var(--accent-blue)" : "var(--text-secondary)",
            backgroundColor: isRouteActive(["/workspace"]) ? "var(--accent-blue-transparent)" : "transparent",
            transition: "all 0.2s ease",
            position: "relative",
          }}
          title={t("fileHistoryTooltip")}
        >
          <FolderOpen size={18} />
          {pendingCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: "4px",
                right: "4px",
                backgroundColor: "var(--accent-red)",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
              }}
            />
          )}
        </Link>

        {userRole === "admin" && (
          <Link
            to="/cache"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              color: isRouteActive(["/cache"]) ? "var(--accent-blue)" : "var(--text-secondary)",
              backgroundColor: isRouteActive(["/cache"]) ? "var(--accent-blue-transparent)" : "transparent",
              transition: "all 0.2s ease",
            }}
            title="本地下载缓存"
          >
            <HardDriveDownload size={18} />
          </Link>
        )}

        {userRole === "admin" && (
          <Link
            to="/settings"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              color: isRouteActive(["/settings"]) ? "var(--accent-blue)" : "var(--text-secondary)",
              backgroundColor: isRouteActive(["/settings"]) ? "var(--accent-blue-transparent)" : "transparent",
              transition: "all 0.2s ease",
            }}
            title={t("settingsTooltip")}
          >
            <Settings size={18} />
          </Link>
        )}

        <button
          onClick={handleLogout}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            color: "var(--accent-red)",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--accent-red-transparent)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          title={t("logoutTooltip")}
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
};
