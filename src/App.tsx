import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { AppShell } from "./components/AppShell";
import { ChatPage } from "./views/ChatPage";
import { DownloadsPage } from "./views/DownloadsPage";
import { SettingsPage } from "./views/SettingsPage";
import { LoginPage } from "./views/LoginPage";
import { WorkspacePage } from "./views/WorkspacePage";

const ProtectedRoute: React.FC<{ children: React.ReactNode; requireAdmin?: boolean }> = ({ children, requireAdmin = false }) => {
  const { userRole, loading } = useApp();

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "var(--bg-app)",
          color: "var(--text-primary)",
          fontSize: "0.9rem",
          fontWeight: "500",
        }}
      >
        Initializing system...
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
