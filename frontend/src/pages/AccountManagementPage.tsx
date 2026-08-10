import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  CheckOutlined,
  CopyOutlined,
  PlusOutlined,
  SearchOutlined,
  TagOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import AccountLabelEditor from "../components/AccountLabelEditor";
import { useMailAppStore } from "../store/useMailAppStore";
import type {
  MailAccount,
  ProviderKind,
  ServiceReceptionStatus,
} from "../types/mail";
import {
  accountCanRegisterService,
  accountHasServiceIssue,
  accountMatchesLabels,
  getReusableAccountLabels,
  getServiceDirectory,
} from "../utils/accountLabels";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

export default function AccountManagementPage() {
  const { message } = App.useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderKind>("gmail");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "connected" | "attention"
  >("all");
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [accountViewMode, setAccountViewMode] = useState<
    "bound" | "available" | "blocked"
  >("bound");
  const [registrationServiceName, setRegistrationServiceName] = useState("");
  const accounts = useMailAppStore((state) => state.accounts);
  const bindAccount = useMailAppStore((state) => state.bindAccount);
  const removeAccount = useMailAppStore((state) => state.removeAccount);
  const updateAccountLabels = useMailAppStore(
    (state) => state.updateAccountLabels,
  );
  const isBinding = useMailAppStore((state) => state.isBindingAccount);
  const reusableLabels = useMemo(
    () => getReusableAccountLabels(accounts),
    [accounts],
  );
  const serviceDirectory = useMemo(
    () => getServiceDirectory(accounts),
    [accounts],
  );
  const selectedServiceName = labelFilter.length === 1 ? labelFilter[0] : "";

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesQuery =
        !normalizedQuery ||
        account.email.toLowerCase().includes(normalizedQuery) ||
        account.displayName.toLowerCase().includes(normalizedQuery) ||
        account.labels.some((label) =>
          label.toLowerCase().includes(normalizedQuery),
        ) ||
        Object.keys(account.serviceStatuses ?? {}).some((serviceName) =>
          serviceName.toLowerCase().includes(normalizedQuery),
        ) ||
        Object.values(account.serviceNotes ?? {}).some((note) =>
          note.toLowerCase().includes(normalizedQuery),
        );
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "connected" && account.status === "connected") ||
        (statusFilter === "attention" && account.status !== "connected");
      const matchesServiceView =
        accountViewMode === "available"
          ? accountCanRegisterService(account, selectedServiceName)
          : accountViewMode === "blocked"
            ? accountHasServiceIssue(account, selectedServiceName)
            : accountMatchesLabels(account, labelFilter) &&
              (!selectedServiceName ||
                !accountHasServiceIssue(account, selectedServiceName));
      return matchesQuery && matchesStatus && matchesServiceView;
    });
  }, [
    accounts,
    accountViewMode,
    labelFilter,
    query,
    selectedServiceName,
    statusFilter,
  ]);

  const connectedCount = accounts.filter(
    (account) => account.status === "connected",
  ).length;
  const attentionCount = accounts.length - connectedCount;
  const taggedCount = accounts.filter(
    (account) => account.labels.length,
  ).length;
  const serviceIssueCount = accounts.reduce(
    (count, account) =>
      count + Object.keys(account.serviceStatuses ?? {}).length,
    0,
  );

  const selectService = (
    serviceName: string,
    mode: "bound" | "available" | "blocked",
  ) => {
    const normalizedName = serviceName.trim();
    setRegistrationServiceName(normalizedName);
    setLabelFilter(normalizedName ? [normalizedName] : []);
    setAccountViewMode(normalizedName ? mode : "bound");
    if (!normalizedName) {
      setStatusFilter("all");
    } else if (mode === "available") {
      setStatusFilter("connected");
    } else if (mode === "blocked") {
      setStatusFilter("all");
    }
  };

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      message.success("邮箱已复制");
    } catch {
      message.error("复制失败，请检查浏览器剪贴板权限");
    }
  };

  const handleMarkService = async (accountId: string) => {
    if (!selectedServiceName) {
      return;
    }
    try {
      const account = accounts.find((item) => item.id === accountId);
      if (!account) {
        return;
      }
      await updateAccountLabels(
        accountId,
        Array.from(new Set([...account.labels, selectedServiceName])),
        account.serviceNotes,
        Object.fromEntries(
          Object.entries(account.serviceStatuses ?? {}).filter(
            ([serviceName]) => serviceName !== selectedServiceName,
          ),
        ),
      );
      message.success(`已标记为 ${selectedServiceName} 邮箱`);
    } catch {
      message.error("标记失败，请稍后重试");
    }
  };

  const handleMarkServiceUnavailable = async (accountId: string) => {
    if (!selectedServiceName) {
      return;
    }
    try {
      const account = accounts.find((item) => item.id === accountId);
      if (!account) {
        return;
      }
      await updateAccountLabels(
        accountId,
        account.labels,
        account.serviceNotes,
        {
          ...(account.serviceStatuses ?? {}),
          [selectedServiceName]: "unavailable" satisfies ServiceReceptionStatus,
        },
      );
      message.success(`已标记 ${selectedServiceName} 收不到验证码`);
    } catch {
      message.error("标记失败，请稍后重试");
    }
  };

  const handleRestoreServiceAvailability = async (accountId: string) => {
    if (!selectedServiceName) {
      return;
    }
    try {
      const account = accounts.find((item) => item.id === accountId);
      if (!account) {
        return;
      }
      const nextStatuses = { ...(account.serviceStatuses ?? {}) };
      delete nextStatuses[selectedServiceName];
      await updateAccountLabels(
        accountId,
        account.labels,
        account.serviceNotes,
        nextStatuses,
      );
      message.success(`已恢复 ${selectedServiceName} 的候选资格`);
    } catch {
      message.error("恢复失败，请稍后重试");
    }
  };

  const renderServiceStatusActions = (account: MailAccount) => {
    if (!selectedServiceName) {
      return null;
    }
    if (accountHasServiceIssue(account, selectedServiceName)) {
      return (
        <Button
          icon={<CheckOutlined />}
          type="link"
          onClick={() => void handleRestoreServiceAvailability(account.id)}
        >
          恢复可注册
        </Button>
      );
    }
    return (
      <Space size={4} wrap>
        {accountViewMode === "available" ? (
          <Button
            icon={<CheckOutlined />}
            type="link"
            onClick={() => void handleMarkService(account.id)}
          >
            标记已注册
          </Button>
        ) : null}
        <Button
          danger
          type="link"
          onClick={() => void handleMarkServiceUnavailable(account.id)}
        >
          收不到验证码
        </Button>
      </Space>
    );
  };

  const handleAddAccount = async () => {
    const result = await bindAccount(provider);
    message.success(result.message);
    setIsModalOpen(false);
  };

  const handleRemove = async (accountId: string) => {
    const result = await removeAccount(accountId);
    message.success(result.message);
  };

  return (
    <section className="page-grid">
      <div className="page-header-row">
        <div>
          <h2>服务邮箱配置</h2>
          <p>给邮箱标记可接收的验证码服务，并记录对应服务账号备注。</p>
        </div>
        <div className="page-actions">
          <Button
            icon={<PlusOutlined />}
            type="primary"
            onClick={() => setIsModalOpen(true)}
          >
            添加邮箱
          </Button>
        </div>
      </div>

      <div className="account-overview" aria-label="服务绑定概览">
        <div>
          <span>服务数</span>
          <strong>{serviceDirectory.length}</strong>
        </div>
        <div>
          <span>已配置邮箱</span>
          <strong className="success-text">{taggedCount}</strong>
        </div>
        <div>
          <span>收码异常</span>
          <strong className={serviceIssueCount ? "warning-text" : ""}>
            {serviceIssueCount}
          </strong>
        </div>
        <div>
          <span>需要处理</span>
          <strong className={attentionCount ? "warning-text" : ""}>
            {attentionCount}
          </strong>
        </div>
      </div>

      <section className="surface-card service-directory-panel">
        <div className="table-toolbar service-directory-heading">
          <div>
            <h3>服务目录</h3>
            <p>先选服务，再维护这个服务可使用的邮箱和账号备注。</p>
          </div>
          <div className="service-directory-actions">
            <div className="service-registration-tool">
              <span>注册新账号</span>
              <Input.Search
                allowClear
                aria-label="输入注册服务名称"
                enterButton="找未使用邮箱"
                placeholder="输入服务名称，如 OpenAI"
                value={registrationServiceName}
                onChange={(event) =>
                  setRegistrationServiceName(event.target.value)
                }
                onSearch={(value) => selectService(value, "available")}
              />
            </div>
            <Button
              type={labelFilter.length ? "default" : "primary"}
              onClick={() => selectService("", "bound")}
            >
              全部邮箱
            </Button>
          </div>
        </div>
        {serviceDirectory.length ? (
          <div className="service-card-grid">
            {serviceDirectory.map((service) => {
              const isActive = selectedServiceName === service.name;
              return (
                <button
                  aria-pressed={isActive}
                  className={`service-card ${isActive ? "active" : ""}`}
                  key={service.name}
                  type="button"
                  onClick={() =>
                    selectService(isActive ? "" : service.name, "bound")
                  }
                >
                  <span>{service.name}</span>
                  <strong>{service.accountCount}</strong>
                  <small>
                    {service.availableCount} 个可注册 · {service.connectedCount}{" "}
                    个已绑定可用
                  </small>
                  {service.blockedCount ? (
                    <small className="service-card-warning">
                      {service.blockedCount} 个收不到验证码
                    </small>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <Empty
            className="service-directory-empty"
            description="还没有服务绑定。先给邮箱添加服务名称，例如 OpenAI、GitHub、Stripe。"
          />
        )}
      </section>

      <section
        className="surface-card account-table-shell"
        aria-labelledby="account-table-title"
      >
        <div className="table-toolbar">
          <div>
            <h3 id="account-table-title">
              {selectedServiceName
                ? `${selectedServiceName} ${
                    accountViewMode === "available"
                      ? "可注册邮箱"
                      : accountViewMode === "blocked"
                        ? "收不到验证码的邮箱"
                        : "已绑定邮箱"
                  }`
                : "服务可用邮箱"}
            </h3>
            <p>
              {accountViewMode === "available" && selectedServiceName
                ? `共 ${filteredAccounts.length} 个可注册邮箱，注册完成后可一键标记`
                : accountViewMode === "blocked" && selectedServiceName
                  ? `共 ${filteredAccounts.length} 个收不到验证码的邮箱，可恢复候选资格`
                  : `共 ${filteredAccounts.length} 个匹配结果，可直接维护服务绑定和账号备注`}
            </p>
          </div>
          <div className="table-filters">
            {selectedServiceName ? (
              <Segmented
                aria-label="切换服务邮箱视图"
                value={accountViewMode}
                options={[
                  { label: "可注册新号", value: "available" },
                  { label: "已绑定", value: "bound" },
                  { label: "收不到验证码", value: "blocked" },
                ]}
                onChange={(value) =>
                  selectService(
                    selectedServiceName,
                    value as "bound" | "available" | "blocked",
                  )
                }
              />
            ) : null}
            <Input
              allowClear
              aria-label="搜索邮箱、服务或备注"
              prefix={<SearchOutlined />}
              placeholder="搜索邮箱、服务或备注"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              allowClear
              aria-label="按服务筛选邮箱"
              maxTagCount="responsive"
              mode="multiple"
              options={reusableLabels.map((label) => ({ label, value: label }))}
              placeholder="高级服务筛选"
              suffixIcon={<TagOutlined />}
              value={labelFilter}
              onChange={(labels) => {
                setLabelFilter(labels);
                setRegistrationServiceName(labels[0] ?? "");
                setAccountViewMode("bound");
                if (!labels.length) {
                  setStatusFilter("all");
                }
              }}
            />
            <Segmented
              aria-label="按连接状态筛选"
              value={statusFilter}
              options={[
                { label: "全部", value: "all" },
                { label: "可用", value: "connected" },
                { label: "需关注", value: "attention" },
              ]}
              onChange={(value) =>
                setStatusFilter(value as typeof statusFilter)
              }
              disabled={accountViewMode === "available"}
            />
          </div>
        </div>

        <Table
          rowKey="id"
          pagination={{
            pageSize: 12,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 个邮箱`,
          }}
          scroll={{ x: "max-content" }}
          dataSource={filteredAccounts}
          locale={{
            emptyText: (
              <Empty
                description={
                  accountViewMode === "blocked" && selectedServiceName
                    ? "还没有标记为收不到验证码的邮箱"
                    : accountViewMode === "available" && selectedServiceName
                      ? "没有可注册邮箱，请更换服务或恢复异常邮箱"
                      : "没有匹配的邮箱"
                }
              />
            ),
          }}
          columns={[
            {
              title: "邮箱",
              dataIndex: "email",
              width: 270,
              render: (email, account) => (
                <div className="account-identity">
                  <div className="account-email-row">
                    <Typography.Text strong ellipsis={{ tooltip: email }}>
                      {email}
                    </Typography.Text>
                    <Tooltip title="复制邮箱">
                      <Button
                        aria-label={`复制 ${email}`}
                        className="copy-email-button"
                        icon={<CopyOutlined />}
                        type="text"
                        onClick={() => void handleCopyEmail(email)}
                      />
                    </Tooltip>
                  </div>
                  <span>{account.displayName}</span>
                  <div className="account-mobile-details">
                    <Tag
                      color={
                        account.status === "connected" ? "success" : "warning"
                      }
                    >
                      {account.status === "connected" ? "可用" : "需处理"}
                    </Tag>
                    <AccountLabelEditor
                      compact
                      accountEmail={account.email}
                      availableLabels={reusableLabels}
                      labels={account.labels}
                      serviceNotes={account.serviceNotes}
                      onChange={(labels, serviceNotes) =>
                        updateAccountLabels(account.id, labels, serviceNotes)
                      }
                    />
                    {selectedServiceName ? (
                      <div className="account-mobile-service-status">
                        {renderServiceStatusActions(account)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ),
            },
            {
              title: "提供商",
              responsive: ["md"],
              render: (_, account) => (
                <Space wrap>
                  <Tag>{account.providerLabel}</Tag>
                  <Tag color={account.provider === "gmail" ? "blue" : "cyan"}>
                    {account.provider === "gmail" ? "标签支持" : "文件夹支持"}
                  </Tag>
                </Space>
              ),
            },
            {
              title: "状态",
              responsive: ["md"],
              width: 100,
              render: (_, account) => (
                <Tooltip
                  title={
                    account.status === "connected"
                      ? "账号已启用，短期访问令牌到期时会自动刷新"
                      : "账号已停用或后端已标记异常"
                  }
                >
                  <Tag
                    color={
                      account.status === "connected" ? "success" : "warning"
                    }
                  >
                    {account.status === "connected" ? "可用" : "需处理"}
                  </Tag>
                </Tooltip>
              ),
            },
            {
              title: "服务标签与备注",
              responsive: ["md"],
              width: 420,
              render: (_, account) => (
                <AccountLabelEditor
                  compact
                  accountEmail={account.email}
                  availableLabels={reusableLabels}
                  labels={account.labels}
                  serviceNotes={account.serviceNotes}
                  onChange={(labels, serviceNotes) =>
                    updateAccountLabels(account.id, labels, serviceNotes)
                  }
                />
              ),
            },
            {
              title: "上次同步",
              responsive: ["lg"],
              width: 210,
              render: (_, account) =>
                `${dayjs(account.lastSyncAt).format("YYYY-MM-DD HH:mm")} • ${dayjs(account.lastSyncAt).fromNow()}`,
            },
            {
              title: "操作",
              fixed: "right",
              width: 90,
              render: (_, account) => (
                <Popconfirm
                  okText="移除"
                  cancelText="取消"
                  title="移除此邮箱？"
                  description="移除后该账户将不再出现在当前工作区。"
                  onConfirm={() => void handleRemove(account.id)}
                >
                  <Button danger type="text">
                    移除
                  </Button>
                </Popconfirm>
              ),
            },
            ...(selectedServiceName
              ? [
                  {
                    title: "服务状态",
                    fixed: "right" as const,
                    responsive: ["md"] as Array<
                      "xs" | "sm" | "md" | "lg" | "xl" | "xxl"
                    >,
                    width: 190,
                    render: (_: unknown, account: (typeof accounts)[number]) =>
                      renderServiceStatusActions(account),
                  },
                ]
              : []),
          ]}
        />
      </section>

      <Modal
        title="添加邮箱账户"
        open={isModalOpen}
        okText="确定"
        cancelText="取消"
        onCancel={() => setIsModalOpen(false)}
        onOk={() => void handleAddAccount()}
        okButtonProps={{ loading: isBinding }}
      >
        <div className="modal-form-stack">
          <Select
            style={{ width: "100%" }}
            value={provider}
            options={[
              { label: "Gmail", value: "gmail" },
              { label: "Outlook / Hotmail", value: "microsoft" },
            ]}
            onChange={(value) => setProvider(value)}
          />
          <Typography.Text type="secondary">
            确认后将跳转到提供商授权页面，授权范围会在跳转前展示。
          </Typography.Text>
        </div>
      </Modal>
    </section>
  );
}
