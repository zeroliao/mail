import { useEffect } from "react";
import { App as AntApp, ConfigProvider, Spin } from "antd";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import AccountManagementPage from "./pages/AccountManagementPage";
import AuthBindingPage from "./pages/AuthBindingPage";
import ComposePage from "./pages/ComposePage";
import InboxPage from "./pages/InboxPage";
import { useMailAppStore } from "./store/useMailAppStore";

function BootstrapGate() {
  const bootstrap = useMailAppStore((state) => state.bootstrap);
  const bootstrapped = useMailAppStore((state) => state.bootstrapped);
  const isBootstrapping = useMailAppStore((state) => state.isBootstrapping);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!bootstrapped && isBootstrapping) {
    return (
      <div className="boot-screen">
        <Spin size="large" />
        <p>Loading mailbox workspace...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<Navigate replace to="/inbox" />} />
        <Route path="auth" element={<AuthBindingPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="inbox/:messageId" element={<InboxPage />} />
        <Route path="compose" element={<ComposePage />} />
        <Route path="accounts" element={<AccountManagementPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#2563EB",
          colorInfo: "#2563EB",
          colorSuccess: "#0F766E",
          colorWarning: "#F59E0B",
          colorError: "#DC2626",
          borderRadius: 8,
          fontFamily: "IBM Plex Sans, Segoe UI, PingFang SC, sans-serif"
        }
      }}
    >
      <AntApp>
        <BrowserRouter>
          <BootstrapGate />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
