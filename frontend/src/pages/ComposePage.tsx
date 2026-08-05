import dayjs from "dayjs";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Form, Input, Select, Tag } from "antd";
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
  const updateComposeField = useMailAppStore(
    (state) => state.updateComposeField,
  );
  const sendCompose = useMailAppStore((state) => state.sendCompose);

  const selectedSender = accounts.find(
    (account) => account.id === composeDraft.accountId,
  );

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
    <section className="page-grid compose-page">
      <div className="page-header-row">
        <div className="page-title-group">
          <Button
            aria-label="返回收件箱"
            icon={<ArrowLeftOutlined />}
            type="text"
            onClick={() => navigate("/inbox")}
          />
          <div>
            <h2>撰写邮件</h2>
            <p>
              {composeMode === "new"
                ? "新邮件"
                : composeMode === "reply"
                  ? "回复邮件"
                  : "转发邮件"}
            </p>
          </div>
        </div>
        <div className="page-actions">
          <span className="save-state">
            <CheckCircleOutlined />
            {lastDraftSavedAt
              ? `已保存 ${dayjs(lastDraftSavedAt).format("HH:mm")}`
              : "等待编辑"}
          </span>
          <Button onClick={() => navigate("/inbox")}>取消</Button>
          <Button
            form="compose-form"
            htmlType="submit"
            icon={<SendOutlined />}
            loading={isSendingCompose}
            type="primary"
          >
            发送邮件
          </Button>
        </div>
      </div>

      <div className="compose-layout">
        <main className="surface-card compose-editor-panel">
          <Form
            id="compose-form"
            layout="vertical"
            onFinish={() => void handleSend()}
          >
            <div className="compose-address-grid">
              <Form.Item label="发件账户" required>
                <Select
                  showSearch
                  optionFilterProp="label"
                  value={composeDraft.accountId}
                  options={accounts.map((account) => ({
                    label: `${account.email} (${account.providerLabel})`,
                    value: account.id,
                  }))}
                  onChange={(value) => updateComposeField("accountId", value)}
                />
              </Form.Item>

              <Form.Item label="收件人" required>
                <Input
                  placeholder="name@example.com, team@example.com"
                  value={composeDraft.to}
                  onChange={(event) =>
                    updateComposeField("to", event.target.value)
                  }
                />
              </Form.Item>
            </div>

            <div className="compose-address-grid">
              <Form.Item label="抄送">
                <Input
                  placeholder="可选抄送收件人"
                  value={composeDraft.cc}
                  onChange={(event) =>
                    updateComposeField("cc", event.target.value)
                  }
                />
              </Form.Item>

              <Form.Item label="密送">
                <Input
                  placeholder="可选密送收件人"
                  value={composeDraft.bcc}
                  onChange={(event) =>
                    updateComposeField("bcc", event.target.value)
                  }
                />
              </Form.Item>
            </div>

            <Form.Item label="主题" required>
              <Input
                placeholder="输入清晰、具体的邮件主题"
                value={composeDraft.subject}
                onChange={(event) =>
                  updateComposeField("subject", event.target.value)
                }
              />
            </Form.Item>

            <Form.Item className="compose-body-field" label="正文">
              <RichTextEditor
                value={composeDraft.body}
                onChange={(value) => updateComposeField("body", value)}
              />
            </Form.Item>
          </Form>
        </main>

        <aside className="compose-review-panel">
          <span className="section-label">发送检查</span>
          <h3>确认邮件信息</h3>
          <div className="review-list">
            <div>
              <span>发件身份</span>
              <strong>{selectedSender?.email ?? "尚未选择"}</strong>
            </div>
            <div>
              <span>收件人</span>
              <strong>{composeDraft.to.trim() ? "已填写" : "待填写"}</strong>
            </div>
            <div>
              <span>主题</span>
              <strong>
                {composeDraft.subject.trim() ? "已填写" : "待填写"}
              </strong>
            </div>
            <div>
              <span>草稿</span>
              <strong>{lastDraftSavedAt ? "已自动保存" : "尚未修改"}</strong>
            </div>
          </div>
          {!accounts.length ? (
            <Alert
              message="没有可用的发件账户"
              description="请先添加并连接邮箱账户。"
              showIcon
              type="warning"
            />
          ) : null}
          <Tag color="blue">HTML 邮件</Tag>
        </aside>
      </div>
    </section>
  );
}
