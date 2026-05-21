import React from "react";
import { useApp } from "../context/AppContext";
import { Wifi, WifiOff } from "lucide-react";

export const ConnectionStatus: React.FC = () => {
  const { connectionStatus } = useApp();

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return "Connected to TDLib";
      case "connecting":
        return "Connecting...";
      case "reconnecting":
        return "Reconnecting...";
      case "offline":
        return "Offline";
      default:
        return "Unknown Status";
    }
  };

  return (
    <div className={`status-badge ${connectionStatus}`} style={{ width: "100%", justifyContent: "center", padding: "8px" }}>
      {connectionStatus === "connected" ? (
        <Wifi size={14} />
      ) : (
        <WifiOff size={14} className="animate-pulse-slow" />
      )}
      <span>{getStatusText()}</span>
    </div>
  );
};
