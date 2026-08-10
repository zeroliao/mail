import {
  ClockCircleOutlined,
  CopyOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  FlagFilled,
  FolderOpenOutlined,
  InboxOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  SendOutlined,
  StarOutlined,
} from "@ant-design/icons";
import {
  App,
  Alert,
  Avatar,
  Button,
  Drawer,
  Empty,
  Grid,
  Pagination,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
} from "antd";
import dayjs from "dayjs";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AccountLabelEditor from "../components/AccountLabelEditor";
import HtmlMailViewer from "../components/HtmlMailViewer";
import { ALL_ACCOUNTS_ID } from "../services/mockData";
import { useMailAppStore } from "../store/useMailAppStore";
import type { FolderKey, MailAccount, MailDetail } from "../types/mail";
import {
  accountMatchesLabels,
  getAccountServiceNote,
  getReusableAccountLabels,
  getServiceDirectory,
} from "../utils/accountLabels";
import { extractVerificationCode } from "../utils/verificationCode";

const { useBreakpoint } = Grid;

const folderLabels: Record<FolderKey, string> = {
  inbox: "收件箱",
  starred: "已标星",
  sent: "已发送",
  drafts: "草稿",
  archive: "归档",
};

const folderIcons: Record<FolderKey, React.ReactNode> = {
  inbox: <InboxOutlined />,
  starred: <StarOutlined />,
  sent: <SendOutlined />,
  drafts: <EditOutlined />,
  archive: <FolderOpenOutlined />,
};

const toPlainPreview = (value: string) => {
  const parsed = new DOMParser().parseFromString(value, "text/html");
  return (parsed.body.textContent ?? value).replace(/\s+/g, " ").trim();
};

function DetailContent({
  message,
  account,
  selectedService,
  onReply,
  onForward,
}: {
  message: MailDetail;
  account?: MailAccount;
  selectedService: string;
  onReply: () => Promise<void>;
  onForward: () => Promise<void>;
}) {
  const { message: toast } = App.useApp();
  const [isCopyingCode, setIsCopyingCode] = useState(false);
  const verificationCode = extractVerificationCode([
    message.subject,
    message.bodyType === "html" ? message.htmlBody : message.textBody,
    message.preview,
  ]);

  const copyVerificationCode = async () => {
    if (!verificationCode || isCopyingCode) return;

    setIsCopyingCode(true);
    try {
      await navigator.clipboard.writeText(verificationCode);
      toast.success(`验证码 ${verificationCode} 已复制`);
    } catch {
      toast.error("复制失败，请检查浏览器剪贴板权限");
    } finally {
      setIsCopyingCode(false);
    }
  };

  return (
    <div className="detail-scroll">
      <div className="detail-header">
        <div className="detail-heading-row">
          <div className="detail-heading-copy">
            <Space wrap size={6}>
              {(selectedService
                ? [selectedService]
                : (account?.labels ?? [])
              ).map((label) => (
                <Tag color="blue" key={label}>
                  {label}
                </Tag>
              ))}
              {!selectedService && !account?.labels.length ? (
                <Tag color="default">未归类服务</Tag>
              ) : null}
              <Tag>{account?.email ?? message.accountDisplayName}</Tag>
              <Tag>{message.providerLabel}</Tag>
              {message.attachments ? (
                <Tag icon={<PaperClipOutlined />}>{message.attachments}</Tag>
              ) : null}
            </Space>
            <h3>{message.subject}</h3>
          </div>
        </div>

        {verificationCode ? (
          <div
            className="verification-code-bar"
            aria-label={`识别到验证码 ${verificationCode}`}
          >
            <div className="verification-code-copy">
              <span>验证码</span>
              <strong>{verificationCode}</strong>
            </div>
            <Button
              className="copy-code-button"
              icon={<CopyOutlined />}
              loading={isCopyingCode}
              type="primary"
              onClick={() => void copyVerificationCode()}
            >
              复制验证码
            </Button>
          </div>
        ) : null}

        <div className="sender-row">
          <Avatar>
            {message.fromName.trim().charAt(0).toUpperCase() || "M"}
          </Avatar>
          <div className="sender-copy">
            <strong>{message.fromName}</strong>
            <span>{message.fromEmail}</span>
          </div>
          <time dateTime={message.receivedAt}>
            {dayjs(message.receivedAt).format("YYYY-MM-DD HH:mm")}
          </time>
        </div>

        <div className="detail-meta">
          {selectedService && account ? (
            <span className="service-context-row">
              <strong>{selectedService} 账号</strong>
              {getAccountServiceNote(account, selectedService) || "未填写备注"}
            </span>
          ) : null}
          <span>
            <strong>收件人</strong>
            {message.to.join(", ")}
          </span>
          {message.cc.length ? (
            <span>
              <strong>抄送</strong>
              {message.cc.join(", ")}
            </span>
          ) : null}
        </div>

        <div className="detail-actions detail-secondary-actions">
          <span>低频操作</span>
          <Button type="link" size="small" onClick={() => void onReply()}>
            回复
          </Button>
          <Button type="link" size="small" onClick={() => void onForward()}>
            转发
          </Button>
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
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
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
    messageListError,
    isLoadingMessageDetail,
    messageDetailError,
    selectAccount,
    selectFolder,
    changePage,
    openMessage,
    prepareReply,
    prepareForward,
    refreshMailbox,
    updateAccountLabels,
  } = useMailAppStore();

  useEffect(() => {
    if (!messageId) return;
    const candidate = messages.find((item) => item.id === messageId);
    void openMessage(messageId, candidate?.accountId);
  }, [messageId, messages, openMessage]);

  const activeAccount = accounts.find(
    (account) => account.id === activeAccountId,
  );
  const reusableLabels = useMemo(
    () => getReusableAccountLabels(accounts),
    [accounts],
  );
  const serviceDirectory = useMemo(
    () => getServiceDirectory(accounts),
    [accounts],
  );
  const labelScopedAccounts = useMemo(
    () =>
      accounts.filter((account) => accountMatchesLabels(account, labelFilter)),
    [accounts, labelFilter],
  );

  useEffect(() => {
    if (
      activeAccountId !== ALL_ACCOUNTS_ID &&
      activeAccount &&
      !accountMatchesLabels(activeAccount, labelFilter)
    ) {
      void selectAccount(ALL_ACCOUNTS_ID);
    }
  }, [activeAccount, activeAccountId, labelFilter, selectAccount]);

  const visibleMessages = useMemo(
    () =>
      messages.filter((item) => {
        const query = searchQuery.trim().toLowerCase();
        const messageAccount = accounts.find(
          (account) => account.id === item.accountId,
        );
        const matchesQuery =
          !query ||
          item.subject.toLowerCase().includes(query) ||
          item.fromName.toLowerCase().includes(query) ||
          item.preview.toLowerCase().includes(query) ||
          Boolean(
            messageAccount &&
            [
              ...messageAccount.labels,
              ...Object.values(messageAccount.serviceNotes ?? {}),
              messageAccount.email,
            ].some((value) => value.toLowerCase().includes(query)),
          );

        const matchesFilter =
          quickFilter === "all" ||
          (quickFilter === "unread" && !item.read) ||
          (quickFilter === "starred" && item.flagged) ||
          (quickFilter === "codes" &&
            Boolean(extractVerificationCode([item.subject, item.preview])));

        const matchesAccountLabels =
          !labelFilter.length ||
          Boolean(
            messageAccount && accountMatchesLabels(messageAccount, labelFilter),
          );

        return matchesQuery && matchesFilter && matchesAccountLabels;
      }),
    [accounts, labelFilter, messages, quickFilter, searchQuery],
  );

  const showDrawerDetail = !screens.xl;
  const detailTargetId = messageId ?? messages[0]?.id;
  const detailTargetAccountId = messages.find(
    (item) => item.id === detailTargetId,
  )?.accountId;

  const retryDetail = () => {
    if (!detailTargetId) return;
    void openMessage(detailTargetId, detailTargetAccountId);
  };

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
    <section className="mail-workspace" aria-label="邮件工作区">
      <aside className="mail-nav-panel">
        <div className="panel-heading compact">
          <div>
            <span className="section-label">邮件范围</span>
            <h3>邮箱</h3>
          </div>
          <Tooltip title="刷新当前邮箱">
            <Button
              aria-label="刷新当前邮箱"
              icon={<ReloadOutlined />}
              loading={isLoadingMessages}
              type="text"
              onClick={() => void refreshMailbox()}
            />
          </Tooltip>
        </div>

        <Button
          block
          className={`all-accounts-button ${activeAccountId === ALL_ACCOUNTS_ID && !labelFilter.length ? "active" : ""}`}
          icon={<InboxOutlined />}
          onClick={() => {
            setLabelFilter([]);
            void selectAccount(ALL_ACCOUNTS_ID);
          }}
        >
          <span>全部服务</span>
          <span className="nav-count">
            {accounts.reduce((sum, account) => sum + account.unreadCount, 0)}
          </span>
        </Button>

        <div className="mail-nav-section service-directory-nav">
          <span className="section-label">先选服务</span>
          <nav className="service-menu" aria-label="验证码服务">
            {serviceDirectory.length ? (
              serviceDirectory.map((service) => {
                const isSelected = labelFilter.includes(service.name);
                return (
                  <Button
                    block
                    className={isSelected ? "active" : ""}
                    key={service.name}
                    type="text"
                    onClick={() => {
                      setLabelFilter(isSelected ? [] : [service.name]);
                      void selectAccount(ALL_ACCOUNTS_ID);
                    }}
                  >
                    <span className="service-menu-label">{service.name}</span>
                    <span className="service-menu-meta">
                      {service.accountCount} 个邮箱
                    </span>
                  </Button>
                );
              })
            ) : (
              <p className="service-empty-copy">
                还没有服务绑定。先在“服务标签”中给邮箱添加服务。
              </p>
            )}
          </nav>
        </div>

        <div className="mail-nav-section">
          <span className="section-label">低频文件夹</span>
          <nav className="folder-menu" aria-label="邮件文件夹">
            {(Object.keys(folderLabels) as FolderKey[]).map((folder) => (
              <Button
                block
                className={folder === activeFolder ? "active" : ""}
                icon={folderIcons[folder]}
                key={folder}
                type="text"
                onClick={() => void selectFolder(folder)}
              >
                <span>{folderLabels[folder]}</span>
                <span className="nav-count">{folderCounts[folder] ?? 0}</span>
              </Button>
            ))}
          </nav>
        </div>

        <div className="mail-nav-section account-scope">
          <label
            className="section-label account-select-label"
            htmlFor="account-scope-select"
          >
            账户范围
          </label>
          <Select
            id="account-scope-select"
            showSearch
            optionFilterProp="label"
            value={activeAccountId}
            options={[
              {
                label: labelFilter.length
                  ? `${labelFilter[0]} · ${labelScopedAccounts.length} 个邮箱`
                  : "全部可用邮箱",
                value: ALL_ACCOUNTS_ID,
              },
              ...labelScopedAccounts.map((account) => ({
                label: account.email,
                value: account.id,
              })),
            ]}
            onChange={(value) => void selectAccount(value)}
          />
          <p className="account-scope-meta">
            {activeAccountId === ALL_ACCOUNTS_ID
              ? labelFilter.length
                ? `${labelScopedAccounts.length} 个邮箱可接收 ${labelFilter[0]} 验证码`
                : `${labelScopedAccounts.length} 个邮箱纳入当前收件范围`
              : `${activeAccount?.providerLabel ?? "邮箱"} · ${activeAccount?.status === "connected" ? "邮箱可用" : "需要处理"}`}
          </p>
          {activeAccount ? (
            <div className="inbox-account-labels">
              <span className="section-label">服务绑定与备注</span>
              <AccountLabelEditor
                compact
                accountEmail={activeAccount.email}
                availableLabels={reusableLabels}
                labels={activeAccount.labels}
                serviceNotes={activeAccount.serviceNotes}
                onChange={(labels, serviceNotes) =>
                  updateAccountLabels(activeAccount.id, labels, serviceNotes)
                }
              />
            </div>
          ) : null}
        </div>
      </aside>

      <section className="mail-list-panel" aria-labelledby="mail-list-title">
        <div className="panel-heading">
          <div>
            <span className="section-label">
              {labelFilter[0]
                ? `当前服务：${labelFilter[0]}`
                : activeAccountId === ALL_ACCOUNTS_ID
                  ? "全部账户"
                  : (activeAccount?.email ?? "当前账户")}
            </span>
            <h3 id="mail-list-title">
              {quickFilter === "codes"
                ? "验证码邮件"
                : folderLabels[activeFolder]}
            </h3>
          </div>
          <div className="panel-counter">
            <ClockCircleOutlined />
            <span>{visibleMessages.length} 封可见</span>
          </div>
        </div>

        {messageListError ? (
          <Alert
            action={
              <Button size="small" onClick={() => void refreshMailbox()}>
                重试
              </Button>
            }
            className="mail-list-error"
            description="已有缓存邮件仍会保留。确认网络或 VPN 可用后重试实时同步。"
            message={messageListError}
            showIcon
            type="warning"
          />
        ) : null}

        {isLoadingMessages ? (
          <Skeleton
            className="mail-list-loading"
            active
            paragraph={{ rows: 8 }}
          />
        ) : null}
        {!isLoadingMessages && !accounts.length ? (
          <Empty className="mail-empty" description="尚未连接邮箱账户">
            <Button type="primary" onClick={() => navigate("/auth")}>
              添加账户
            </Button>
          </Empty>
        ) : null}
        {!isLoadingMessages &&
        accounts.length > 0 &&
        !visibleMessages.length ? (
          <Empty className="mail-empty" description="当前范围内没有匹配邮件" />
        ) : null}

        <div className="message-list message-list-scroll">
          {!isLoadingMessages &&
            visibleMessages.map((item) => {
              const isActive =
                messageId === item.id ||
                (!showDrawerDetail && selectedMessage?.id === item.id);
              const itemAccount = accounts.find(
                (account) => account.id === item.accountId,
              );
              const serviceNote =
                labelFilter[0] && itemAccount
                  ? getAccountServiceNote(itemAccount, labelFilter[0])
                  : "";
              return (
                <button
                  aria-pressed={isActive}
                  key={`${item.accountId}:${item.id}`}
                  className={`message-tile ${isActive ? "active" : ""} ${!item.read ? "unread" : ""}`}
                  onClick={() => navigate(`/inbox/${item.id}`)}
                  type="button"
                >
                  <span className="message-meta">
                    <strong>{item.fromName}</strong>
                    <time dateTime={item.receivedAt}>
                      {dayjs(item.receivedAt).format("MM-DD HH:mm")}
                    </time>
                  </span>
                  <span className="message-subject">
                    {!item.read ? (
                      <EyeInvisibleOutlined aria-label="未读" />
                    ) : null}
                    {item.subject}
                  </span>
                  <span className="message-preview">
                    {toPlainPreview(item.preview)}
                  </span>
                  <span className="message-footer">
                    <span>{item.accountDisplayName}</span>
                    {serviceNote ? (
                      <span className="message-service-note">
                        {serviceNote}
                      </span>
                    ) : null}
                    <span className="message-indicators">
                      {item.flagged ? <FlagFilled aria-label="已标星" /> : null}
                      {item.attachments ? (
                        <>
                          <PaperClipOutlined aria-label="有附件" />
                          {item.attachments}
                        </>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })}
        </div>

        {mailPagination.total > mailPagination.pageSize ? (
          <div className="mail-pagination">
            <Pagination
              simple
              current={mailPagination.page}
              pageSize={mailPagination.pageSize}
              total={mailPagination.total}
              onChange={(page) => {
                navigate("/inbox");
                void changePage(page);
              }}
            />
            <span>{visibleMessages.length} 封可见</span>
          </div>
        ) : null}
      </section>

      {!showDrawerDetail ? (
        <article className="mail-detail-panel">
          {!selectedMessage && isLoadingMessageDetail ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : null}
          {!selectedMessage && !isLoadingMessageDetail && messageDetailError ? (
            <Alert
              action={
                <Button size="small" onClick={retryDetail}>
                  重试
                </Button>
              }
              description="邮件列表已加载，但当前邮件正文暂时无法获取。"
              message={messageDetailError}
              showIcon
              type="error"
            />
          ) : null}
          {!selectedMessage &&
          !isLoadingMessageDetail &&
          !messageDetailError ? (
            <Empty
              className="detail-empty"
              description="选择一封邮件查看完整内容"
            />
          ) : null}
          {selectedMessage ? (
            <DetailContent
              account={accounts.find(
                (account) => account.id === selectedMessage.accountId,
              )}
              message={selectedMessage}
              selectedService={labelFilter[0] ?? ""}
              onReply={handleReply}
              onForward={handleForward}
            />
          ) : null}
        </article>
      ) : null}

      <Drawer
        className="detail-drawer"
        destroyOnClose={false}
        onClose={() => navigate("/inbox")}
        open={
          showDrawerDetail && Boolean(messageId) && Boolean(selectedMessage)
        }
        placement="right"
        title={selectedMessage?.subject || "邮件详情"}
        width={screens.md ? 520 : "100%"}
      >
        {isLoadingMessageDetail ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : null}
        {!isLoadingMessageDetail && messageDetailError ? (
          <Alert
            action={
              <Button size="small" onClick={retryDetail}>
                重试
              </Button>
            }
            description="邮件列表已加载，但当前邮件正文暂时无法获取。"
            message={messageDetailError}
            showIcon
            type="error"
          />
        ) : null}
        {selectedMessage ? (
          <DetailContent
            account={accounts.find(
              (account) => account.id === selectedMessage.accountId,
            )}
            message={selectedMessage}
            selectedService={labelFilter[0] ?? ""}
            onReply={handleReply}
            onForward={handleForward}
          />
        ) : null}
      </Drawer>
    </section>
  );
}
