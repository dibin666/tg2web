import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BotList } from "./BotList";
import { ModeToggle } from "./ModeToggle";
import { useApp } from "../context/AppContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MessageSquare,
  Settings,
  LogOut,
  FolderOpen,
  HardDriveDownload,
  Disc3,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CONNECTION_META = {
  connected: { color: "bg-success", label: "已连接", pulse: false },
  connecting: { color: "bg-warning", label: "连接中", pulse: true },
  reconnecting: { color: "bg-warning", label: "重连中", pulse: true },
  offline: { color: "bg-destructive", label: "离线", pulse: false },
} as const;

interface NavIconProps {
  to: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
  showDot?: boolean;
}

const NavIcon: React.FC<NavIconProps> = ({ to, label, active, children, showDot }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Link
        to={to}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-xl transition-colors",
          active
            ? "bg-primary/12 text-primary"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        )}
      >
        {children}
        {showDot && (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-sidebar" />
        )}
      </Link>
    </TooltipTrigger>
    <TooltipContent side="top">{label}</TooltipContent>
  </Tooltip>
);

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceFiles, connectionStatus, userRole, logout } = useApp();

  const pendingCount = workspaceFiles.filter((f) => f.status === "pending").length;
  const connection = CONNECTION_META[connectionStatus];

  const isRoute = (prefix: string) =>
    prefix === "/"
      ? location.pathname === "/" || location.pathname.startsWith("/bots")
      : location.pathname.startsWith(prefix);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Brand header */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <div className="gradient-brand flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
          <Send className="size-[18px] -translate-x-px translate-y-px" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-serif text-base font-semibold leading-tight">TG Relay</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    connection.color,
                    connection.pulse && "animate-pulse"
                  )}
                />
              </TooltipTrigger>
              <TooltipContent side="right">网关状态:{connection.label}</TooltipContent>
            </Tooltip>
          </div>
          <span className="block truncate text-xs text-muted-foreground">共享 Telegram 中继门户</span>
        </div>
      </div>

      {/* Bots */}
      <BotList />

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-0.5 border-t border-sidebar-border px-2 py-2">
        <NavIcon to="/" label="活动对话" active={isRoute("/")}>
          <MessageSquare className="size-[18px]" />
        </NavIcon>
        <NavIcon to="/workspace" label="文件历史" active={isRoute("/workspace")} showDot={pendingCount > 0}>
          <FolderOpen className="size-[18px]" />
        </NavIcon>
        <NavIcon to="/qobuz" label="Qobuz 商店搜索" active={isRoute("/qobuz")}>
          <Disc3 className="size-[18px]" />
        </NavIcon>
        {userRole === "admin" && (
          <NavIcon to="/cache" label="本地下载缓存" active={isRoute("/cache")}>
            <HardDriveDownload className="size-[18px]" />
          </NavIcon>
        )}
        {userRole === "admin" && (
          <NavIcon to="/settings" label="系统设置" active={isRoute("/settings")}>
            <Settings className="size-[18px]" />
          </NavIcon>
        )}
        <ModeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="size-9 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-[18px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">登出系统</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
