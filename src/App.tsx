import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { AppShell } from "./components/AppShell";
import { ChatPage } from "./views/ChatPage";
import { DownloadsPage } from "./views/DownloadsPage";
import { SettingsPage } from "./views/SettingsPage";
import { LoginPage } from "./views/LoginPage";
import { WorkspacePage } from "./views/WorkspacePage";
import { CachePage } from "./views/CachePage";
import { QobuzSearchPage } from "./views/QobuzSearchPage";

const ProtectedRoute: React.FC<{ children: React.ReactNode; requireAdmin?: boolean }> = ({ children, requireAdmin = false }) => {
  const { userRole, loading } = useApp();

  if (loading) {
    return (
      <div className="flex h-svh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="gradient-brand size-10 animate-pulse rounded-2xl" />
          <span className="text-sm font-medium">正在初始化系统...</span>
        </div>
      </div>
    );
  }

  if (!userRole) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && userRole !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <AppProvider>
        <Routes>
          {/* Public login page */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Shell pages */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppShell>
                  <Routes>
                    <Route path="/" element={<ChatPage />} />
                    <Route path="/bots/:botId" element={<ChatPage />} />
                    <Route path="/workspace" element={<WorkspacePage />} />
                    <Route path="/downloads" element={<DownloadsPage />} />
                    <Route path="/qobuz" element={<QobuzSearchPage />} />
                    <Route
                      path="/cache"
                      element={
                        <ProtectedRoute requireAdmin>
                          <CachePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <ProtectedRoute requireAdmin>
                          <SettingsPage />
                        </ProtectedRoute>
                      }
                    />
                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppShell>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AppProvider>
    </Router>
  );
}

export default App;
