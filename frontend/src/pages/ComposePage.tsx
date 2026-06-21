import dayjs from "dayjs";
import { Alert, App, Button, Card, Form, Input, Select, Space, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import RichTextEditor from "../components/RichTextEditor";
import { useMailAppStore } from "../store/useMailAppStore";

export default function ComposePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const accounts = useMailAppStore((state) => state.accounts);
  const composeDraft = useMailAppStore((state) => state.composeDraft);
  const composeMode = useMailAppStore((state) => state.composeMode);
  const isSendingCompose = useMailAppStore((state) => state.isSendingCompose);
  const lastDraftSavedAt = useMailAppStore((state) => state.lastDraftSavedAt);
  const updateComposeField = useMailAppStore((state) => state.updateComposeField);
  const sendCompose = useMailAppStore((state) => state.sendCompose);

  const selectedSender = accounts.find((account) => account.id === composeDraft.accountId);

  const handleSend = async () => {
    try {
      const result = await sendCompose();
      message.success(result.message);
      navigate("/inbox");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "发送失败");
    }
  };

  return (
    <section className="page-grid">
      <div className="page-header-row">
        <div>
          <h2>撰写邮件</h2>
          <p>确认发件人身份，自动保存草稿，减少误发。</p>
        </div>
        <Space>
          <Tag color="processing">模式: {composeMode === "new" ? "新邮件" : composeMode === "reply" ? "回复" : "转发"}</Tag>
          <Tag>{lastDraftSavedAt ? `已保存 ${dayjs(lastDraftSavedAt).format("HH:mm:ss")}` : "草稿待保存"}</Tag>
          <Button type="primary" loading={isSendingCompose} onClick={() => void handleSend()}>
            发送邮件
          </Button>
        </Space>
      </div>

      <Card className="surface-card">
        <Alert
          className="compose-alert"
          description="发送前请确认发件账户。定时发送、签名和多提供商功能暂为保留状态。"
          message={`当前发件人: ${selectedSender?.email ?? "请先选择发件账户"}`}
          showIcon
          type="info"
        />

        <Form layout="vertical">
          <Form.Item label="发件账户" required>
            <Select
              value={composeDraft.accountId}
              options={accounts.map((account) => ({
                label: `${account.email} (${account.providerLabel})`,
                value: account.id
              }))}
              onChange={(value) => updateComposeField("accountId", value)}
            />
          </Form.Item>

          <Form.Item label="收件人" required>
            <Input
              placeholder="name@example.com, team@example.com"
              value={composeDraft.to}
              onChange={(event) => updateComposeField("to", event.target.value)}
            />
          </Form.Item>

          <Form.Item label="抄送">
            <Input
              placeholder="可选抄送收件人"
              value={composeDraft.cc}
              onChange={(event) => updateComposeField("cc", event.target.value)}
            />
          </Form.Item>

          <Form.Item label="密送">
            <Input
              placeholder="可选密送收件人"
              value={composeDraft.bcc}
              onChange={(event) => updateComposeField("bcc", event.target.value)}
            />
          </Form.Item>

          <Form.Item label="主题" required>
            <Input
              placeholder="邮件主题"
              value={composeDraft.subject}
              onChange={(event) => updateComposeField("subject", event.target.value)}
            />
          </Form.Item>

          <Form.Item label="正文">
            <RichTextEditor
              value={composeDraft.body}
              onChange={(value) => updateComposeField("body", value)}
            />
          </Form.Item>

          <Space wrap>
            <Tag color="success">草稿自动保存</Tag>
            <Tag>签名（保留）</Tag>
            <Tag>定时发送（保留）</Tag>
          </Space>
        </Form>
      </Card>
    </section>
  );
}
