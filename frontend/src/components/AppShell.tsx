import {
  AppstoreOutlined,
  FilterOutlined,
  LinkOutlined,
  LogoutOutlined,
  MailOutlined,
  PoweroffOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  SyncOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  App,
  Avatar,
  Badge,
  Button,
  Input,
  Layout,
  Menu,
  Modal,
  Segmented,
  Tooltip,
} from "antd";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../services/http";
import { mailApi } from "../services/mailApi";
import { useMailAppStore } from "../store/useMailAppStore";

const navItems = [
  { key: "/inbox", label: "收件箱", icon: <MailOutlined /> },
  { key: "/compose", label: "写邮件", icon: <SendOutlined /> },
  { key: "/accounts", label: "账户管理", icon: <AppstoreOutlined /> },
  { key: "/auth", label: "添加账户", icon: <LinkOutlined /> },
];

const pageMeta = {
  "/auth": {
    title: "添加与绑定账户",
    description: "连接 OAuth、Token 或邮箱密码账户",
  },
  "/inbox": { title: "收件箱", description: "跨账户查看、筛选和处理邮件" },
  "/compose": { title: "写邮件", description: "选择发件身份并创建邮件" },
  "/accounts": { title: "账户管理", description: "检查连接状态与同步健康度" },
};

export default function AppShell() {
  const { message } = App.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [isStopModalOpen, setIsStopModalOpen] = useState(false);
  const [isStoppingServices, setIsStoppingServices] = useState(false);
  const accounts = useMailAppStore((state) => state.accounts);
  const health = useMailAppStore((state) => state.health);
  const backendError = useMailAppStore((state) => state.backendError);
  const searchQuery = useMailAppStore((state) => state.searchQuery);
  const quickFilter = useMailAppStore((state) => state.quickFilter);
  const isAuthenticated = useMailAppStore((state) => state.isAuthenticated);
  const isLoadingMessages = useMailAppStore((state) => state.isLoadingMessages);
  const setSearchQuery = useMailAppStore((state) => state.setSearchQuery);
  const setQuickFilter = useMailAppStore((state) => state.setQuickFilter);
  const logout = useMailAppStore((state) => state.logout);

  const unreadCount = accounts.reduce(
    (sum, account) => sum + account.unreadCount,
    0,
  );
  const selectedKey =
    navItems.find((item) => location.pathname.startsWith(item.key))?.key ??
    "/inbox";
  const currentMeta =
    pageMeta[selectedKey as keyof typeof pageMeta] ?? pageMeta["/inbox"];
  const menuItems = navItems.map((item) => ({
    ...item,
    disabled: !isAuthenticated && item.key !== "/auth",
  }));

  const stopServices = async () => {
    setIsStoppingServices(true);
    try {
      await mailApi.stopServices();
      setIsStopModalOpen(false);
      message.success("停止命令已发送，可以关闭当前页面");
    } catch (error) {
      setIsStoppingServices(false);
      message.error(getApiErrorMessage(error, "停止服务失败，请重试"));
    }
  };

  return (
    <Layout className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>

      <aside className="app-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <SafetyCertificateOutlined />
          </div>
          <div className="brand-copy">
            <h1>MailOps</h1>
            <p>邮件控制台</p>
          </div>
        </div>

        <Button
          block
          className="compose-shortcut"
          disabled={!isAuthenticated}
          icon={<SendOutlined />}
          type="primary"
          onClick={() => navigate("/compose")}
        >
          写新邮件
        </Button>

        <nav aria-label="主导航">
          <Menu
            className="app-nav"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />
        </nav>

        <div className="sidebar-status">
          <div className="service-status">
            <Badge status={health?.status === "ok" ? "success" : "warning"} />
            <div>
              <strong>
                {health?.status === "ok" ? "服务运行正常" : "服务已降级"}
              </strong>
              <span>{backendError ? "部分功能可能不可用" : "API 已连接"}</span>
            </div>
          </div>
          <div className="sidebar-user">
            <Avatar icon={<UserOutlined />} />
            <div>
              <strong>{isAuthenticated ? "管理员" : "访客"}</strong>
              <span>
                {isAuthenticated
                  ? `${accounts.length} 个已连接账户`
                  : "请先登录"}
              </span>
            </div>
            {isAuthenticated ? (
              <Tooltip title="退出登录">
                <Button
                  aria-label="退出登录"
                  icon={<LogoutOutlined />}
                  type="text"
                  onClick={() => logout()}
                />
              </Tooltip>
            ) : null}
          </div>
        </div>
      </aside>

      <Layout className="app-main">
        <Layout.Header
          className={`app-header ${location.pathname.startsWith("/inbox") ? "inbox-header" : ""}`}
        >
          <div className="page-context">
            <h2>{currentMeta.title}</h2>
            <p>{currentMeta.description}</p>
          </div>

          {location.pathname.startsWith("/inbox") ? (
            <div className="topbar-tools">
              <Input.Search
                allowClear
                aria-label="搜索邮件"
                className="topbar-search"
                placeholder="搜索主题、发件人或正文预览"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <Segmented
                aria-label="邮件快速筛选"
                value={quickFilter}
                options={[
                  { label: "全部", value: "all" },
                  { label: "未读", value: "unread" },
                  { label: "已标星", value: "starred" },
                  { label: "附件", value: "attachments" },
                ]}
                onChange={(value) =>
                  setQuickFilter(
                    value as "all" | "unread" | "starred" | "attachments",
                  )
                }
              />
            </div>
          ) : (
            <div className="topbar-summary">
              <Badge status={health?.status === "ok" ? "success" : "warning"} />
              <span>{health?.status === "ok" ? "API 正常" : "API 已降级"}</span>
            </div>
          )}

          <div className="topbar-actions">
            {location.pathname.startsWith("/inbox") ? (
              <div className="sync-state">
                {isLoadingMessages ? <SyncOutlined spin /> : <FilterOutlined />}
                <span>
                  {isLoadingMessages ? "正在同步" : `${unreadCount} 封未读`}
                </span>
              </div>
            ) : null}
            {isAuthenticated ? (
              <Tooltip title={isStoppingServices ? "正在停止服务" : "停止服务"}>
                <Button
                  aria-label={isStoppingServices ? "正在停止服务" : "停止服务"}
                  className="stop-service-button"
                  danger
                  icon={<PoweroffOutlined />}
                  loading={isStoppingServices}
                  type="text"
                  onClick={() => setIsStopModalOpen(true)}
                />
              </Tooltip>
            ) : null}
            <Avatar className="topbar-avatar">MO</Avatar>
          </div>
        </Layout.Header>

        <Layout.Content id="main-content" className="app-content">
          <Outlet />
        </Layout.Content>

        <nav className="mobile-nav" aria-label="移动端主导航">
          {navItems.map((item) => (
            <button
              aria-current={selectedKey === item.key ? "page" : undefined}
              className={`mobile-nav-item ${selectedKey === item.key ? "active" : ""}`}
              disabled={!isAuthenticated && item.key !== "/auth"}
              key={item.key}
              type="button"
              onClick={() => navigate(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </Layout>

      <Modal
        cancelButtonProps={{ disabled: isStoppingServices }}
        cancelText="取消"
        centered
        closable={!isStoppingServices}
        maskClosable={!isStoppingServices}
        okButtonProps={{ danger: true, loading: isStoppingServices }}
        okText="停止服务"
        open={isStopModalOpen}
        title="停止 MailOps 服务？"
        onCancel={() => setIsStopModalOpen(false)}
        onOk={() => void stopServices()}
      >
        <p className="shutdown-confirmation-copy">
          停止后当前页面将无法继续加载数据。再次使用时，请双击桌面的 MailOps
          邮件控制台快捷方式。
        </p>
      </Modal>
    </Layout>
  );
}
