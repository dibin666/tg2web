import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { BotSummary } from "../api/types";
import { useApp } from "../context/AppContext";
import { BotAvatar } from "./BotAvatar";
import { Badge } from "@/components/ui/badge";
import { Pin, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface BotListItemProps {
  bot: BotSummary;
}

export const BotListItem: React.FC<BotListItemProps> = ({ bot }) => {
  const { activeBotId, selectBot } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = activeBotId === bot.id;
  const isChatRoute = location.pathname === "/" || location.pathname.startsWith("/bots");

  return (
    <button
      type="button"
      onClick={() => {
        selectBot(bot.id);
        if (!isChatRoute) navigate(`/bots/${bot.id}`);
      }}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all duration-150",
        isActive
          ? "bg-card shadow-sm ring-1 ring-border"
          : "hover:bg-sidebar-accent active:scale-[0.99]"
      )}
    >
      <BotAvatar id={bot.id} title={bot.title} size={40} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm font-medium",
              isActive ? "text-foreground" : "text-sidebar-foreground"
            )}
          >
            {bot.title}
          </span>
          {bot.isPinned && <Pin className="size-3 shrink-0 rotate-45 text-muted-foreground" />}
          {bot.status === "restricted" && (
            <ShieldAlert className="size-3.5 shrink-0 text-destructive" aria-label="Restricted bot" />
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {bot.lastMessagePreview || `@${bot.username || "unknown_bot"}`}
        </div>
      </div>

      {bot.unreadCount > 0 && (
        <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
          {bot.unreadCount > 99 ? "99+" : bot.unreadCount}
        </Badge>
      )}
    </button>
  );
};
