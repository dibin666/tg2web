import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { BotListItem } from "./BotListItem";
import { Search, BotOff } from "lucide-react";

export const BotList: React.FC = () => {
  const { bots } = useApp();
  const [search, setSearch] = useState("");

  const filteredBots = bots.filter(
    (b) =>
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Search Input */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-color)", backgroundColor: "var(--bg-sidebar)" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", color: "var(--text-muted)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search third-party bots..."
            style={{
              width: "100%",
              backgroundColor: "#f1f5f9",
              border: "1px solid var(--border-color)",
              padding: "6px 8px 6px 30px",
              borderRadius: "6px",
              fontSize: "0.8rem",
              color: "var(--text-primary)",
              outline: "none",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent-blue)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-color)")}
          />
        </div>
      </div>

      {/* List items */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
        {filteredBots.length === 0 ? (
          <div
            style={{
              padding: "24px 12px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "0.8rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <BotOff size={24} style={{ opacity: 0.5 }} />
            <span>No matching bots configured.</span>
          </div>
        ) : (
          filteredBots.map((b) => <BotListItem key={b.id} bot={b} />)
        )}
      </div>
    </div>
  );
};
