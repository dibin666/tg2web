import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { BotListItem } from "./BotListItem";
import { Input } from "@/components/ui/input";
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="bot-list-search"
            name="bot-list-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索机器人..."
            className="h-9 rounded-full border-transparent bg-background/70 pl-9 text-sm shadow-none focus-visible:border-ring dark:bg-background/40"
          />
        </div>
      </div>

      {/* List */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {filteredBots.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-sm text-muted-foreground">
            <BotOff className="size-6 opacity-50" />
            <span>没有匹配的机器人</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredBots.map((b) => (
              <BotListItem key={b.id} bot={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
