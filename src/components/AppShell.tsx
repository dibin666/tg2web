import React, { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MessageInspector } from "./MessageInspector";
import { EventLogPanel } from "./EventLogPanel";
import { useApp } from "../context/AppContext";
import { Menu, Send } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedMessage, settings } = useApp();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileSidebarOpen(false);
  }, [location]);

  return (
    <div className="flex h-svh w-full gap-2 bg-background p-2 max-md:gap-0 max-md:p-0">
      {/* Desktop sidebar island */}
      <aside className="hidden w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar md:flex">
        <Sidebar />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 max-md:gap-0">
        {/* Mobile top bar */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2 md:hidden">
          <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 rounded-xl">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] gap-0 border-sidebar-border bg-sidebar p-0">
              <SheetTitle className="sr-only">导航侧栏</SheetTitle>
              <Sidebar />
            </SheetContent>
          </Sheet>
          <div className="gradient-brand flex size-7 items-center justify-center rounded-lg text-white">
            <Send className="size-3.5" />
          </div>
          <span className="font-serif text-sm font-semibold">TG Relay</span>
        </header>

        {/* Content island */}
        <main className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border bg-card max-md:rounded-none max-md:border-0">
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>

          {/* Inspector — docked on wide screens */}
          {selectedMessage && (
            <div className="hidden w-[380px] shrink-0 border-l xl:flex">
              <MessageInspector />
            </div>
          )}

          {/* Inspector — floating glass overlay on narrow screens */}
          {selectedMessage && (
            <div className="glass-panel shadow-float absolute inset-y-0 right-0 z-30 flex w-full max-w-[400px] xl:hidden">
              <MessageInspector />
            </div>
          )}
        </main>

        {/* Developer event feed */}
        {settings?.debugMode && <EventLogPanel />}
      </div>
    </div>
  );
};
