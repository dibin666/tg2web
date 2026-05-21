import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { AppShell } from "./components/AppShell";
import { ChatPage } from "./views/ChatPage";
import { DownloadsPage } from "./views/DownloadsPage";
import { SettingsPage } from "./views/SettingsPage";
import { LoginPage } from "./views/LoginPage";

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
              <AppShell>
                <Routes>
                  <Route path="/" element={<ChatPage />} />
                  <Route path="/bots/:botId" element={<ChatPage />} />
                  <Route path="/downloads" element={<DownloadsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AppShell>
            }
          />
        </Routes>
      </AppProvider>
    </Router>
  );
}

export default App;
