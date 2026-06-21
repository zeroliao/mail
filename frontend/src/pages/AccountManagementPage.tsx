import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { App, Button, Card, Modal, Popconfirm, Select, Space, Steps, Table, Tag } from "antd";
import { useState } from "react";
import { useMailAppStore } from "../store/useMailAppStore";
import type { ProviderKind } from "../types/mail";

dayjs.extend(relativeTime);

export default function AccountManagementPage() {
  const { message } = App.useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderKind>("gmail");
  const accounts = useMailAppStore((state) => state.accounts);
  const bindAccount = useMailAppStore((state) => state.bindAccount);
  const removeAccount = useMailAppStore((state) => state.removeAccount);
  const isBinding = useMailAppStore((state) => state.isBindingAccount);

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
          <p>查看已连接账户、绑定状态及各提供商功能差异。</p>
        </div>
        <div className="table-actions">
          <Button type="primary" onClick={() => setIsModalOpen(true)}>
            添加账户
          </Button>
        </div>
      </div>

      <Card className="surface-card">
        <Steps
          current={3}
          items={[
            { title: "选择提供商" },
            { title: "认证" },
            { title: "权限范围" },
            { title: "初始同步" }
          ]}
        />
      </Card>

      <Table
        rowKey="id"
        className="surface-card"
        pagination={false}
        dataSource={accounts}
        columns={[
          {
            title: "邮箱",
            dataIndex: "email"
          },
          {
            title: "提供商",
            render: (_, account) => (
              <Space wrap>
                <Tag>{account.providerLabel}</Tag>
                <Tag color={account.provider === "gmail" ? "blue" : "cyan"}>
                  {account.provider === "gmail" ? "标签支持" : "文件夹支持"}
                </Tag>
              </Space>
            )
          },
          {
            title: "状态",
            render: (_, account) => (
              <Tag color={account.status === "connected" ? "success" : "warning"}>{account.status === "connected" ? "已连接" : "需关注"}</Tag>
            )
          },
          {
            title: "上次同步",
            render: (_, account) =>
              `${dayjs(account.lastSyncAt).format("YYYY-MM-DD HH:mm")} • ${dayjs(account.lastSyncAt).fromNow()}`
          },
          {
            title: "功能",
            render: (_, account) => (
              <Space wrap>
                <Tag color="success">草稿同步</Tag>
                <Tag color={account.provider === "microsoft" ? "warning" : "default"}>
                  定时发送
                </Tag>
                <Tag>签名</Tag>
              </Space>
            )
          },
          {
            title: "操作",
            render: (_, account) => (
              <Popconfirm
                okText="移除"
                cancelText="取消"
                title="移除此邮箱？"
                description="移除后该账户将不再出现在当前工作区。"
                onConfirm={() => void handleRemove(account.id)}
              >
                <Button danger>移除</Button>
              </Popconfirm>
            )
          }
        ]}
      />

      <Modal
        title="添加邮箱账户"
        open={isModalOpen}
        okText="确定"
        cancelText="取消"
        onCancel={() => setIsModalOpen(false)}
        onOk={() => void handleAddAccount()}
        okButtonProps={{ loading: isBinding }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select
            value={provider}
            options={[
              { label: "Gmail", value: "gmail" },
              { label: "Outlook / Hotmail", value: "microsoft" }
            ]}
            onChange={(value) => setProvider(value)}
          />
          <Tag>跳转前会再次展示 OAuth 权限范围。</Tag>
        </Space>
      </Modal>
    </section>
  );
}
