import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { MessageInspector } from "./MessageInspector";
import { useApp } from "../context/AppContext";
import { Menu, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { DownloadQueueWidget } from "./DownloadQueueWidget";

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedMessage } = useApp();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on navigation in mobile
  useEffect(() => {
    if (mobileSidebarOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMobileSidebarOpen(false);
    }
  }, [location, mobileSidebarOpen]);

  return (
    <div className="app-container">
      {/* Mobile Header */}
      <div
        className="mobile-header"
        style={{
          display: "none",
          height: "48px",
          backgroundColor: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--border-color)",
          alignItems: "center",
          padding: "0 12px",
          justifyContent: "space-between",
          width: "100%",
          position: "absolute",
          top: 0,
          zIndex: 20,
        }}
      >
        <button
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          style={{ color: "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          {mobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span style={{ fontSize: "0.85rem", fontWeight: "bold" }}>TG Web Relay Portal</span>
        <div style={{ width: "20px" }} />
      </div>

      {/* Sidebar Wrapper */}
      <div className={`sidebar-wrapper ${mobileSidebarOpen ? "open" : ""}`}>
        <Sidebar />
      </div>

      {/* Main Panel Wrapper */}
      <div
        className="main-panel-wrapper"
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          height: "100%",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
          {/* Main Content Pane */}
          <div style={{ flex: 1, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {children}
          </div>

          {/* Inspector Panel */}
          {selectedMessage && (
            <div className="inspector-wrapper">
              <MessageInspector />
            </div>
          )}
        </div>
      </div>

      {/* Dynamic styles for layout responsiveness */}
      <style>{`
        .sidebar-wrapper {
          display: block;
          height: 100%;
        }
        .inspector-wrapper {
          width: var(--inspector-width);
          height: 100%;
          flex-shrink: 0;
        }
        @media (max-width: 1024px) {
          .inspector-wrapper {
            position: absolute;
            right: 0;
            top: 0;
            bottom: 0;
            width: 320px;
            z-index: 15;
            box-shadow: -4px 0 12px rgba(0,0,0,0.15);
            animation: slideInRight 0.2s ease-out;
          }
        }
        @media (max-width: 768px) {
          .mobile-header {
            display: flex !important;
          }
          .sidebar-wrapper {
            position: absolute;
            left: 0;
            top: 48px;
            bottom: 0;
            width: 280px;
            z-index: 30;
            transform: translateX(-100%);
            transition: transform 0.2s ease-in-out;
            box-shadow: 4px 0 12px rgba(0,0,0,0.5);
          }
          .sidebar-wrapper.open {
            transform: translateX(0);
          }
          .main-panel-wrapper {
            padding-top: 48px;
          }
          .inspector-wrapper {
            position: absolute;
            left: 0;
            right: 0;
            top: 48px;
            bottom: 0;
            width: 100%;
            z-index: 25;
          }
        }
      `}</style>
      <DownloadQueueWidget />
    </div>
  );
};
