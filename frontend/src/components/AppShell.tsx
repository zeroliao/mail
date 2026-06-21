import {
  AppstoreOutlined,
  FilterOutlined,
  LinkOutlined,
  LogoutOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  SyncOutlined
} from "@ant-design/icons";
import { Avatar, Badge, Button, Input, Layout, Menu, Segmented, Space, Tag } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ALL_ACCOUNTS_ID } from "../services/mockData";
import { useMailAppStore } from "../store/useMailAppStore";

const navItems = [
  { key: "/auth", label: "绑定账户", icon: <LinkOutlined /> },
  { key: "/inbox", label: "收件箱", icon: <MailOutlined /> },
  { key: "/compose", label: "撰写", icon: <SendOutlined /> },
  { key: "/accounts", label: "账户", icon: <AppstoreOutlined /> }
];

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const accounts = useMailAppStore((state) => state.accounts);
  const health = useMailAppStore((state) => state.health);
  const backendError = useMailAppStore((state) => state.backendError);
  const searchQuery = useMailAppStore((state) => state.searchQuery);
  const quickFilter = useMailAppStore((state) => state.quickFilter);
  const activeAccountId = useMailAppStore((state) => state.activeAccountId);
  const isAuthenticated = useMailAppStore((state) => state.isAuthenticated);
  const isLoadingMessages = useMailAppStore((state) => state.isLoadingMessages);
  const setSearchQuery = useMailAppStore((state) => state.setSearchQuery);
  const setQuickFilter = useMailAppStore((state) => state.setQuickFilter);
  const logout = useMailAppStore((state) => state.logout);

  const unreadCount = accounts.reduce((sum, account) => sum + account.unreadCount, 0);
  const selectedKey = navItems.find((item) => location.pathname.startsWith(item.key))?.key ?? "/inbox";
  const activeAccount = accounts.find((item) => item.id === activeAccountId);
  const currentStatusLabel = activeAccountId === ALL_ACCOUNTS_ID
    ? "统一收件箱"
    : activeAccount?.displayName || "无账户";

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <div className="app-header-row">
          <div className="brand-lockup">
            <div className="brand-mark">
              <SafetyCertificateOutlined style={{ fontSize: 22 }} />
            </div>
            <div className="brand-copy">
              <h1>邮件控制台</h1>
              <p>{currentStatusLabel}</p>
            </div>
          </div>

          <div className="topbar-center">
            <Menu
              className="app-nav"
              mode="horizontal"
              selectedKeys={[selectedKey]}
              items={navItems}
              onClick={({ key }) => navigate(key)}
            />
            {location.pathname.startsWith("/inbox") ? (
              <div className="topbar-tools">
                <Input.Search
                  allowClear
                  className="topbar-search"
                  placeholder="搜索主题、发件人或预览"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <Segmented
                  value={quickFilter}
                  options={[
                    { label: "全部", value: "all" },
                    { label: "未读", value: "unread" },
                    { label: "已标星", value: "starred" },
                    { label: "附件", value: "attachments" }
                  ]}
                  onChange={(value) =>
                    setQuickFilter(value as "all" | "unread" | "starred" | "attachments")
                  }
                />
              </div>
            ) : null}
          </div>

          <Space wrap>
            <Tag color={health?.status === "ok" ? "success" : "warning"}>
              {health?.status === "ok" ? "API 正常" : "API 已降级"}
            </Tag>
            {location.pathname.startsWith("/inbox") ? (
              <Tag icon={isLoadingMessages ? <SyncOutlined spin /> : <FilterOutlined />}>
                {isLoadingMessages ? "同步中" : quickFilter}
              </Tag>
            ) : null}
            {backendError ? <Tag color="error">API 备用</Tag> : null}
            <Badge count={unreadCount} overflowCount={99}>
              <Button type="primary" icon={<SendOutlined />} onClick={() => navigate("/compose")}>
                新邮件
              </Button>
            </Badge>
            <Avatar className="topbar-avatar">MC</Avatar>
            {isAuthenticated ? (
              <Button icon={<LogoutOutlined />} onClick={() => logout()}>
                退出登录
              </Button>
            ) : null}
          </Space>
        </div>
      </Layout.Header>

      <Layout.Content className="app-content">
        <div className="content-wrap">
          <Outlet />
        </div>
      </Layout.Content>
    </Layout>
  );
}
