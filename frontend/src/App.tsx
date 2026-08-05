import { useEffect } from "react";
import { App as AntApp, ConfigProvider, Spin } from "antd";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import AppShell from "./components/AppShell";
import AccountManagementPage from "./pages/AccountManagementPage";
import AuthBindingPage from "./pages/AuthBindingPage";
import ComposePage from "./pages/ComposePage";
import InboxPage from "./pages/InboxPage";
import { useMailAppStore } from "./store/useMailAppStore";

function BootstrapGate() {
  const bootstrap = useMailAppStore((state) => state.bootstrap);
  const bootstrapped = useMailAppStore((state) => state.bootstrapped);
  const isAuthenticated = useMailAppStore((state) => state.isAuthenticated);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!bootstrapped) {
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
        <Route
          index
          element={
            <Navigate replace to={isAuthenticated ? "/inbox" : "/auth"} />
          }
        />
        <Route path="auth" element={<AuthBindingPage />} />
        <Route
          element={
            isAuthenticated ? <Outlet /> : <Navigate replace to="/auth" />
          }
        >
          <Route path="inbox" element={<InboxPage />} />
          <Route path="inbox/:messageId" element={<InboxPage />} />
          <Route path="compose" element={<ComposePage />} />
          <Route path="accounts" element={<AccountManagementPage />} />
        </Route>
      </Route>
      <Route
        path="*"
        element={<Navigate replace to={isAuthenticated ? "/inbox" : "/auth"} />}
      />
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
          colorText: "#182230",
          colorTextSecondary: "#667085",
          colorBorder: "#D9DEE7",
          colorBgLayout: "#F3F5F8",
          borderRadius: 6,
          controlHeight: 40,
          fontFamily: "Inter, IBM Plex Sans, Segoe UI, PingFang SC, sans-serif",
        },
        components: {
          Button: {
            primaryShadow: "none",
          },
          Menu: {
            itemBorderRadius: 6,
            itemHeight: 44,
          },
          Table: {
            headerBg: "#F8FAFC",
            headerColor: "#475467",
          },
        },
      }}
    >
      <AntApp>
        <BrowserRouter
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        >
          <BootstrapGate />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
