import {
  ClockCircleOutlined,
  EyeInvisibleOutlined,
  FlagFilled,
  FolderOpenOutlined,
  InboxOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SendOutlined,
  SettingOutlined
} from "@ant-design/icons";
import {
  App,
  Button,
  Drawer,
  Empty,
  Grid,
  Pagination,
  Skeleton,
  Space,
  Tag,
  Typography
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import HtmlMailViewer from "../components/HtmlMailViewer";
import { ALL_ACCOUNTS_ID } from "../services/mockData";
import { useMailAppStore } from "../store/useMailAppStore";
import type { FolderKey, MailDetail } from "../types/mail";

const { useBreakpoint } = Grid;

const folderLabels: Record<FolderKey, string> = {
  inbox: "收件箱",
  starred: "已标星",
  sent: "已发送",
  drafts: "草稿",
  archive: "归档"
};

const secondaryNavItems = [
  { key: "scheduled", label: "定时发送", icon: <ClockCircleOutlined /> },
  { key: "attachments", label: "附件", icon: <PaperClipOutlined /> },
  { key: "settings", label: "设置", icon: <SettingOutlined /> }
];

function getProviderTone(providerLabel: string) {
  if (providerLabel.includes("Gmail")) return "#2563EB";
  if (providerLabel.includes("Hotmail")) return "#F59E0B";
  return "#0F766E";
}

function DetailContent({
  message,
  onReply,
  onForward
}: {
  message: MailDetail;
  onReply: () => Promise<void>;
  onForward: () => Promise<void>;
}) {
  return (
    <div className="detail-scroll">
      <div className="detail-header">
        <Space wrap>
          <Tag color="processing">{message.providerLabel}</Tag>
          <Tag color="blue">{message.accountDisplayName}</Tag>
          <Tag>{folderLabels[message.folder]}</Tag>
          {message.hasHtml ? <Tag>HTML</Tag> : <Tag>纯文本</Tag>}
        </Space>

        <h3>{message.subject}</h3>

        <div className="detail-meta">
          <span>
            发件人: {message.fromName} &lt;{message.fromEmail}&gt;
          </span>
          <span>收件人: {message.to.join(", ")}</span>
          {message.cc.length ? <span>抄送: {message.cc.join(", ")}</span> : null}
          <span>时间: {dayjs(message.receivedAt).format("YYYY-MM-DD HH:mm")}</span>
        </div>

        <div className="detail-actions">
          <Button type="primary" icon={<RollbackOutlined />} onClick={() => void onReply()}>
            回复
          </Button>
          <Button icon={<SendOutlined />} onClick={() => void onForward()}>
            转发
          </Button>
          <Button disabled>归档</Button>
          <Button danger ghost disabled>
            删除
          </Button>
          <Button disabled>上一封</Button>
          <Button disabled>下一封</Button>
        </div>
      </div>

      <HtmlMailViewer message={message} />
    </div>
  );
}

export default function InboxPage() {
  const { message } = App.useApp();
  const screens = useBreakpoint();
  const navigate = useNavigate();
  const { messageId } = useParams();
  const {
    accounts,
    activeAccountId,
    activeFolder,
    messages,
    selectedMessage,
    searchQuery,
    quickFilter,
    folderCounts,
    mailPagination,
    isLoadingMessages,
    isLoadingMessageDetail,
    selectAccount,
    selectFolder,
    changePage,
    openMessage,
    prepareReply,
    prepareForward,
    refreshMailbox
  } = useMailAppStore();

  useEffect(() => {
    if (!messages.length) return;
    const nextMessageId = messageId ?? messages[0]?.id;
    if (!nextMessageId) return;
    const candidate = messages.find((item) => item.id === nextMessageId);
    void openMessage(nextMessageId, candidate?.accountId);
  }, [messageId, messages, openMessage]);

  const activeAccount = accounts.find((account) => account.id === activeAccountId);
  const visibleMessages = useMemo(
    () =>
      messages.filter((item) => {
        const query = searchQuery.trim().toLowerCase();
        const matchesQuery =
          !query ||
          item.subject.toLowerCase().includes(query) ||
          item.fromName.toLowerCase().includes(query) ||
          item.preview.toLowerCase().includes(query);

        const matchesFilter =
          quickFilter === "all" ||
          (quickFilter === "unread" && !item.read) ||
          (quickFilter === "starred" && item.flagged) ||
          (quickFilter === "attachments" && item.attachments > 0);

        return matchesQuery && matchesFilter;
      }),
    [messages, quickFilter, searchQuery]
  );

  const showDrawerDetail = !screens.xl;

  const handleReply = async () => {
    if (!selectedMessage) {
      message.warning("请先选择一条消息。");
      return;
    }
    await prepareReply(selectedMessage.id);
    navigate("/compose");
  };

  const handleForward = async () => {
    if (!selectedMessage) {
      message.warning("请先选择一条消息。");
      return;
    }
    await prepareForward(selectedMessage.id);
    navigate("/compose");
  };

  return (
    <section className="page-grid">
      <div className="metric-row">
        <article className="metric-card">
          <p>活跃账户</p>
          <strong>{accounts.length}</strong>
        </article>
        <article className="metric-card">
          <p>未读邮件</p>
          <strong>{accounts.reduce((sum, account) => sum + account.unreadCount, 0)}</strong>
        </article>
        <article className="metric-card">
          <p>当前范围</p>
          <strong>{activeAccountId === ALL_ACCOUNTS_ID ? "统一收件箱" : activeAccount?.displayName || "单个账户"}</strong>
        </article>
        <article className="metric-card">
          <p>可见邮件</p>
          <strong>{visibleMessages.length}</strong>
        </article>
      </div>

      <div className="workspace-grid">
        <article className="surface-card sidebar-panel">
          <div className="card-title-row">
            <div>
              <h3>账户</h3>
              <p>切换统一收件箱或单账户工作区。</p>
            </div>
            <Button icon={<ReloadOutlined />} onClick={() => void refreshMailbox()}>
              刷新
            </Button>
          </div>

          <Button
            block
            className={`all-accounts-button ${activeAccountId === ALL_ACCOUNTS_ID ? "active" : ""}`}
            icon={<InboxOutlined />}
            onClick={() => void selectAccount(ALL_ACCOUNTS_ID)}
          >
            统一收件箱
          </Button>

          <Space direction="vertical" style={{ width: "100%" }}>
            {accounts.map((account) => (
              <button
                key={account.id}
                className={`account-pill ${account.id === activeAccountId ? "active" : ""}`}
                onClick={() => void selectAccount(account.id)}
                style={{ borderLeft: `4px solid ${getProviderTone(account.providerLabel)}` }}
                type="button"
              >
                <div className="account-pill-title">
                  <Typography.Text strong>{account.displayName}</Typography.Text>
                  <Tag color={account.status === "connected" ? "green" : "orange"}>
                    {account.status === "connected" ? account.unreadCount : "sync"}
                  </Tag>
                </div>
                <div>{account.email}</div>
                <small>{account.providerLabel}</small>
              </button>
            ))}
          </Space>

          <div className="card-title-row" style={{ marginTop: 22 }}>
            <div>
              <h4>文件夹</h4>
              <p>{activeAccountId === ALL_ACCOUNTS_ID ? "全部已连接账户" : activeAccount?.email ?? "请选择账户"}</p>
            </div>
          </div>

          <Space direction="vertical" className="folder-menu" style={{ width: "100%" }}>
            {(Object.keys(folderLabels) as FolderKey[]).map((folder) => (
              <Button
                key={folder}
                type={folder === activeFolder ? "primary" : "default"}
                icon={<FolderOpenOutlined />}
                style={{ justifyContent: "space-between" }}
                onClick={() => void selectFolder(folder)}
              >
                {folderLabels[folder]} ({folderCounts[folder] ?? 0})
              </Button>
            ))}
          </Space>

          <div className="card-title-row" style={{ marginTop: 22 }}>
            <div>
              <h4>工作区</h4>
              <p>定时发送、附件管理及设置功能。</p>
            </div>
          </div>

          <Space direction="vertical" style={{ width: "100%" }}>
            {secondaryNavItems.map((item) => (
              <Button key={item.key} block disabled icon={item.icon}>
                {item.label}
              </Button>
            ))}
          </Space>
        </article>

        <article className="surface-card list-panel">
          <div className="card-title-row">
            <div>
              <h3>邮件列表</h3>
              <p>
                {activeAccountId === ALL_ACCOUNTS_ID
                  ? `全部账户 • ${folderLabels[activeFolder]}`
                  : activeAccount
                    ? `${activeAccount.email} • ${folderLabels[activeFolder]}`
                    : "无活跃账户"}
              </p>
            </div>
            <Space wrap>
              <Tag icon={<ClockCircleOutlined />}>{mailPagination.total} 封</Tag>
              <Tag>{visibleMessages.length} 可见</Tag>
            </Space>
          </div>

          {isLoadingMessages ? <Skeleton active paragraph={{ rows: 6 }} /> : null}
          {!isLoadingMessages && !accounts.length ? (
            <Empty description="尚未绑定账户，请先登录并连接邮箱。" />
          ) : null}
          {!isLoadingMessages && accounts.length > 0 && !visibleMessages.length ? (
            <Empty description="没有符合当前筛选条件的邮件。" />
          ) : null}

          <div className="message-list message-list-scroll">
            {visibleMessages.map((item) => (
              <article
                key={`${item.accountId}:${item.id}`}
                className={`message-tile ${selectedMessage?.id === item.id ? "active" : ""} ${!item.read ? "unread" : ""}`}
                onClick={() => navigate(`/inbox/${item.id}`)}
              >
                <div className="message-meta">
                  <span>{item.fromName}</span>
                  <span>{dayjs(item.receivedAt).format("MMM D, HH:mm")}</span>
                </div>
                <h4 className="message-subject">
                  {!item.read ? <EyeInvisibleOutlined style={{ marginRight: 8, color: "#2563EB" }} /> : null}
                  {item.subject}
                </h4>
                <p className="message-preview">{item.preview}</p>
                <Space wrap style={{ marginTop: 10 }}>
                  <Tag color="blue">{item.accountDisplayName}</Tag>
                  <Tag color={item.provider === "gmail" ? "geekblue" : "cyan"}>{item.providerLabel}</Tag>
                  {item.flagged ? <Tag icon={<FlagFilled />}>已标记</Tag> : null}
                  {item.attachments ? <Tag>{item.attachments} 个附件</Tag> : null}
                </Space>
              </article>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <Pagination
              current={mailPagination.page}
              pageSize={mailPagination.pageSize}
              total={mailPagination.total}
              onChange={(page) => {
                navigate("/inbox");
                void changePage(page);
              }}
            />
          </div>
        </article>

        {!showDrawerDetail ? (
          <article className="surface-card detail-panel">
            {!selectedMessage && isLoadingMessageDetail ? <Skeleton active paragraph={{ rows: 2 }} /> : null}
            {!selectedMessage && !isLoadingMessageDetail ? (
              <Empty description="选择一封邮件以查看详情。" />
            ) : null}
            {selectedMessage ? (
              <DetailContent
                message={selectedMessage}
                onReply={handleReply}
                onForward={handleForward}
              />
            ) : null}
          </article>
        ) : null}
      </div>

      <Drawer
        className="detail-drawer"
        destroyOnClose={false}
        onClose={() => navigate("/inbox")}
        open={showDrawerDetail && Boolean(selectedMessage)}
        placement="right"
        title={selectedMessage?.subject || "邮件详情"}
        width={screens.md ? 520 : "100%"}
        extra={
          <Button icon={<SendOutlined />} size="small" onClick={() => void handleForward()}>
            转发
          </Button>
        }
      >
        {isLoadingMessageDetail ? <Skeleton active paragraph={{ rows: 2 }} /> : null}
        {selectedMessage ? (
          <DetailContent
            message={selectedMessage}
            onReply={handleReply}
            onForward={handleForward}
          />
        ) : null}
      </Drawer>
    </section>
  );
}
