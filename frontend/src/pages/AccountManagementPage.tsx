import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import relativeTime from "dayjs/plugin/relativeTime";
import { PlusOutlined, SearchOutlined, TagOutlined } from "@ant-design/icons";
import {
  App,
  Button,
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
import type { ProviderKind } from "../types/mail";
import {
  accountMatchesLabels,
  getReusableAccountLabels,
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

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesQuery =
        !normalizedQuery ||
        account.email.toLowerCase().includes(normalizedQuery) ||
        account.displayName.toLowerCase().includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "connected" && account.status === "connected") ||
        (statusFilter === "attention" && account.status !== "connected");
      return (
        matchesQuery &&
        matchesStatus &&
        accountMatchesLabels(account, labelFilter)
      );
    });
  }, [accounts, labelFilter, query, statusFilter]);

  const connectedCount = accounts.filter(
    (account) => account.status === "connected",
  ).length;
  const attentionCount = accounts.length - connectedCount;

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
          <h2>账户管理</h2>
          <p>集中检查连接状态、同步时间和需要处理的账户。</p>
        </div>
        <div className="page-actions">
          <Button
            icon={<PlusOutlined />}
            type="primary"
            onClick={() => setIsModalOpen(true)}
          >
            添加账户
          </Button>
        </div>
      </div>

      <div className="account-overview" aria-label="账户连接概览">
        <div>
          <span>全部账户</span>
          <strong>{accounts.length}</strong>
        </div>
        <div>
          <span>账号可用</span>
          <strong className="success-text">{connectedCount}</strong>
        </div>
        <div>
          <span>需要处理</span>
          <strong className={attentionCount ? "warning-text" : ""}>
            {attentionCount}
          </strong>
        </div>
      </div>

      <section
        className="surface-card account-table-shell"
        aria-labelledby="account-table-title"
      >
        <div className="table-toolbar">
          <div>
            <h3 id="account-table-title">已连接账户</h3>
            <p>共 {filteredAccounts.length} 个匹配结果</p>
          </div>
          <div className="table-filters">
            <Input
              allowClear
              aria-label="搜索账户"
              prefix={<SearchOutlined />}
              placeholder="搜索邮箱或名称"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              allowClear
              aria-label="按标签筛选账号"
              maxTagCount="responsive"
              mode="multiple"
              options={reusableLabels.map((label) => ({ label, value: label }))}
              placeholder="按标签筛选"
              suffixIcon={<TagOutlined />}
              value={labelFilter}
              onChange={setLabelFilter}
            />
            <Segmented
              aria-label="按连接状态筛选"
              value={statusFilter}
              options={[
                { label: "全部", value: "all" },
                { label: "正常", value: "connected" },
                { label: "需关注", value: "attention" },
              ]}
              onChange={(value) =>
                setStatusFilter(value as typeof statusFilter)
              }
            />
          </div>
        </div>

        <Table
          rowKey="id"
          pagination={{
            pageSize: 12,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 个账户`,
          }}
          scroll={{ x: "max-content" }}
          dataSource={filteredAccounts}
          columns={[
            {
              title: "邮箱",
              dataIndex: "email",
              width: 270,
              render: (email, account) => (
                <div className="account-identity">
                  <Typography.Text strong ellipsis={{ tooltip: email }}>
                    {email}
                  </Typography.Text>
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
                      onChange={(labels) =>
                        updateAccountLabels(account.id, labels)
                      }
                    />
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
              title: "标签",
              responsive: ["md"],
              width: 280,
              render: (_, account) => (
                <AccountLabelEditor
                  compact
                  accountEmail={account.email}
                  availableLabels={reusableLabels}
                  labels={account.labels}
                  onChange={(labels) => updateAccountLabels(account.id, labels)}
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
