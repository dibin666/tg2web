import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { ModeToggle } from "../components/ModeToggle";
import { Send, Shield, ArrowRight, Loader2, User, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const LoginPage: React.FC = () => {
  const { login, t } = useApp();
  const [activeTab, setActiveTab] = useState<"user" | "admin">("user");
  const [password, setPassword] = useState("");
  const [accessKeyInput, setAccessKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessKeyInput.trim()) {
      setError(t("pleaseInputPass"));
      return;
    }
    setLoading(true);
    setError("");

    try {
      const success = login("user", accessKeyInput.trim());
      if (await success) {
        navigate("/");
      } else {
        setError(t("invalidKeyError"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError(t("pleaseInputPass"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const success = login("admin", password.trim());
      if (await success) {
        navigate("/");
      } else {
        setError(t("incorrectAdminPass"));
      }
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab: "user" | "admin") => {
    if (loading) return;
    setActiveTab(tab);
    setError("");
    setPassword("");
    setAccessKeyInput("");
  };

  const submitButton = (label: string) => (
    <Button
      type="submit"
      disabled={loading}
      className={cn(
        "h-10 w-full rounded-xl text-sm font-semibold text-white shadow-sm transition-all",
        "gradient-brand hover:opacity-90 active:scale-[0.99]"
      )}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          <span>{t("authorizing")}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <ArrowRight className="size-4" />
        </>
      )}
    </Button>
  );

  return (
    <div className="relative flex h-svh w-full items-center justify-center overflow-hidden bg-background p-5">
      {/* Warm radial glow backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px 420px at 18% 8%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 70%), radial-gradient(520px 380px at 85% 92%, color-mix(in srgb, var(--chart-2) 22%, transparent), transparent 70%)",
        }}
      />

      {/* Theme toggle */}
      <div className="absolute right-4 top-4 z-10">
        <ModeToggle />
      </div>

      {/* Login card */}
      <div className="message-entry glass-panel shadow-float relative z-10 flex w-full max-w-sm flex-col gap-6 rounded-3xl p-8">
        {/* Brand */}
        <div className="flex flex-col items-center text-center">
          <div className="gradient-brand mb-4 flex size-14 items-center justify-center rounded-2xl text-white shadow-sm">
            <Send className="size-6 -translate-x-px translate-y-px" />
          </div>
          <h2 className="font-serif text-xl font-semibold">{t("loginTitle")}</h2>
          <span className="mt-1 text-xs text-muted-foreground">{t("loginSub")}</span>
        </div>

        {/* Security note */}
        <div className="flex gap-2.5 rounded-xl bg-[var(--warning-soft)] px-3.5 py-3 text-[11px] leading-relaxed text-warning">
          <Shield className="mt-0.5 size-4 shrink-0" />
          <span>{t("securityWarning")}</span>
        </div>

        {/* Role tabs */}
        <Tabs value={activeTab} onValueChange={(v) => switchTab(v as "user" | "admin")}>
          <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="user" className="gap-1.5 rounded-lg text-xs font-semibold" disabled={loading}>
              <User className="size-3.5" />
              {t("userAccessTab")}
            </TabsTrigger>
            <TabsTrigger value="admin" className="gap-1.5 rounded-lg text-xs font-semibold" disabled={loading}>
              <Lock className="size-3.5" />
              {t("adminTerminalTab")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Forms */}
        {activeTab === "user" ? (
          <form onSubmit={handleUserLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="access-key" className="text-xs font-semibold text-muted-foreground">
                {t("accessKeyLabel")}
              </Label>
              <Input
                id="access-key"
                name="access-key"
                type="password"
                value={accessKeyInput}
                onChange={(e) => setAccessKeyInput(e.target.value)}
                placeholder={t("accessKeyPlaceholder")}
                autoComplete="current-password"
                disabled={loading}
                aria-invalid={Boolean(error)}
                className="h-10 rounded-xl bg-card/60"
              />
            </div>
            {error && <div className="text-xs font-medium text-destructive">{error}</div>}
            {submitButton(t("enterUserPortal"))}
          </form>
        ) : (
          <form onSubmit={handleAdminLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-password" className="text-xs font-semibold text-muted-foreground">
                {t("passwordLabel")}
              </Label>
              <Input
                id="admin-password"
                name="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
                autoComplete="current-password"
                disabled={loading}
                aria-invalid={Boolean(error)}
                className="h-10 rounded-xl bg-card/60"
              />
            </div>
            {error && <div className="text-xs font-medium text-destructive">{error}</div>}
            {submitButton(t("loginAsAdmin"))}
          </form>
        )}
      </div>
    </div>
  );
};
