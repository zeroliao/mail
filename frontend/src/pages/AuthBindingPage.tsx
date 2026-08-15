import type React from "react";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  DownloadOutlined,
  GoogleOutlined,
  KeyOutlined,
  LockOutlined,
  MailOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Divider,
  Form,
  Input,
  List,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getApiErrorDescription,
  getApiErrorMessage,
  getApiValidationIssues,
} from "../services/http";
import { useMailAppStore } from "../store/useMailAppStore";
import type {
  BindOAuthAccountResponse,
  BindOAuthBatchResponse,
  BindOAuthPayload,
  ProviderKind,
} from "../types/mail";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

type TokenImportFormValues = {
  email: string;
  refreshToken: string;
  clientId: string;
  displayName?: string;
  scope?: string[];
};

type BatchImportFormValues = {
  records: string;
};

const providerCards: Array<{
  key: ProviderKind;
  title: string;
  description: string;
  scopeHint: string;
  icon: React.ReactNode;
}> = [
  {
    key: "gmail",
    title: "Gmail OAuth2",
    description:
      "绑定 Google Workspace 或 Gmail 账号，用于收件箱同步、回信和发信。",
    scopeHint: "权限范围：邮箱、个人资料、Gmail 读写、Gmail 发送。",
    icon: <GoogleOutlined style={{ fontSize: 24, color: "#ea4335" }} />,
  },
  {
    key: "microsoft",
    title: "Outlook / Hotmail OAuth2",
    description: "通过兼容 Graph 的授权流程绑定 Microsoft 个人或工作账号。",
    scopeHint: "权限范围：Mail.Read、Mail.ReadWrite、Mail.Send、User.Read。",
    icon: <MailOutlined style={{ fontSize: 24, color: "#0a66c2" }} />,
  },
];

const defaultMicrosoftScopes = [
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
] as const;

const scopeOptions = defaultMicrosoftScopes.map((value) => ({
  label: value,
  value,
}));

const parseScopeText = (value?: string) => {
  const scopes = (value ?? "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return scopes.length ? scopes : undefined;
};

const normalizeBatchPayload = (
  value: Record<string, unknown>,
  lineNumber: number,
): BindOAuthPayload => {
  if (
    typeof value.email !== "string" ||
    typeof value.refreshToken !== "string" ||
    typeof value.clientId !== "string"
  ) {
    throw new Error(
      `第 ${lineNumber} 行缺少必填字段：email、refreshToken、clientId。`,
    );
  }

  const scope = Array.isArray(value.scope)
    ? value.scope.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : typeof value.scope === "string"
      ? parseScopeText(value.scope)
      : undefined;

  return {
    email: value.email.trim(),
    refreshToken: value.refreshToken.trim(),
    clientId: value.clientId.trim(),
    displayName:
      typeof value.displayName === "string" && value.displayName.trim()
        ? value.displayName.trim()
        : undefined,
    scope,
  };
};

const parseBatchRecords = (input: string): BindOAuthPayload[] => {
  const trimmedInput = input.trim();
  if (trimmedInput.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmedInput) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("批量 JSON 必须是账号记录数组。");
      }

      if (!parsed.length) {
        throw new Error("请至少提供一条账号记录。");
      }

      if (parsed.length > 1000) {
        throw new Error("单次最多导入 1000 条账号记录。");
      }

      return parsed.map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw new Error(`第 ${index + 1} 条 JSON 记录格式不正确。`);
        }
        return normalizeBatchPayload(
          item as Record<string, unknown>,
          index + 1,
        );
      });
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("批量 JSON 解析失败。");
    }
  }

  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("请至少粘贴一条账号记录。");
  }

  if (lines.length > 1000) {
    throw new Error("单次最多导入 1000 条账号记录。");
  }

  return lines.map((line, index) => {
    const lineNumber = index + 1;
    if (line.startsWith("{")) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        return normalizeBatchPayload(parsed, lineNumber);
      } catch {
        throw new Error(`第 ${lineNumber} 行 JSON 解析失败。`);
      }
    }

    const delimiter = line.includes("\t")
      ? "\t"
      : line.includes("|")
        ? "|"
        : ",";
    const parts = line.split(delimiter).map((item) => item.trim());
    if (parts.length < 3) {
      throw new Error(
        `第 ${lineNumber} 行格式不正确，至少需要 email、refreshToken、clientId 三列。`,
      );
    }

    const [email, refreshToken, clientId, displayName, ...scopeParts] = parts;
    return {
      email,
      refreshToken,
      clientId,
      displayName: displayName || undefined,
      scope: parseScopeText(scopeParts.join(" ")),
    };
  });
};

const renderErrorDetails = (error: unknown) => {
  const errorDescription = getApiErrorDescription(error);
  const validationIssues = getApiValidationIssues(error);

  if (!errorDescription && !validationIssues.length) {
    return undefined;
  }

  return (
    <Space direction="vertical" size={4}>
      {errorDescription ? (
        <Typography.Text>{errorDescription}</Typography.Text>
      ) : null}
      {validationIssues.map((issue) => (
        <Typography.Text key={issue}>{issue}</Typography.Text>
      ))}
    </Space>
  );
};

const isFormValidationError = (error: unknown) =>
  typeof error === "object" && error !== null && "errorFields" in error;

const shouldUseCustomScope = (scopes?: string[]) => {
  if (!scopes?.length) {
    return false;
  }

  if (scopes.length !== defaultMicrosoftScopes.length) {
    return true;
  }

  const normalized = [...scopes].sort();
  const defaults = [...defaultMicrosoftScopes].sort();
  return normalized.some((item, index) => item !== defaults[index]);
};

export default function AuthBindingPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loginForm] = Form.useForm<{ username: string; password: string }>();
  const [singleForm] = Form.useForm<TokenImportFormValues>();
  const [batchForm] = Form.useForm<BatchImportFormValues>();
  const [imapEmail, setImapEmail] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [singleResult, setSingleResult] =
    useState<BindOAuthAccountResponse | null>(null);
  const [batchResult, setBatchResult] = useState<BindOAuthBatchResponse | null>(
    null,
  );
  const [batchPayload, setBatchPayload] = useState<BindOAuthPayload[]>([]);
  const [singleError, setSingleError] = useState<unknown>(null);
  const [batchError, setBatchError] = useState<unknown>(null);
  const [advancedScopeOpen, setAdvancedScopeOpen] = useState(false);
  const [boundAccountsPage, setBoundAccountsPage] = useState(1);
  const [boundAccountsPageSize, setBoundAccountsPageSize] = useState(8);
  const providerConfig = useMailAppStore((state) => state.providerConfig);
  const accounts = useMailAppStore((state) => state.accounts);
  const isAuthenticated = useMailAppStore((state) => state.isAuthenticated);
  const isLoggingIn = useMailAppStore((state) => state.isLoggingIn);
  const authError = useMailAppStore((state) => state.authError);
  const bindAccount = useMailAppStore((state) => state.bindAccount);
  const bindCredentials = useMailAppStore((state) => state.bindCredentials);
  const bindOAuthAccount = useMailAppStore((state) => state.bindOAuthAccount);
  const bindOAuthAccounts = useMailAppStore((state) => state.bindOAuthAccounts);
  const login = useMailAppStore((state) => state.login);
  const isBinding = useMailAppStore((state) => state.isBindingAccount);

  const handleBind = async (provider: ProviderKind) => {
    const result = await bindAccount(provider);
    message.success(result.message);
  };

  const handleLogin = async () => {
    try {
      const values = await loginForm.validateFields();
      await login(values.username.trim(), values.password);
      loginForm.resetFields(["password"]);
      message.success("已成功登录邮件后端。");
      navigate("/inbox");
    } catch (error) {
      if (isFormValidationError(error)) {
        return;
      }
      message.error(getApiErrorMessage(error, "登录失败"));
    }
  };

  const handleBindCredentials = async () => {
    if (!imapEmail.trim() || !imapPassword.trim()) {
      message.warning("请填写邮箱地址和密码。");
      return;
    }

    try {
      const result = await bindCredentials(imapEmail.trim(), imapPassword);
      if (result.status === "skipped") {
        message.info(result.message);
      } else {
        message.success(result.message);
      }
      setImapEmail("");
      setImapPassword("");
    } catch (error) {
      message.error(getApiErrorMessage(error, "绑定失败"));
    }
  };

  const handleSingleImport = async () => {
    try {
      const values = await singleForm.validateFields();
      const payload: BindOAuthPayload = {
        email: values.email.trim(),
        refreshToken: values.refreshToken.trim(),
        clientId: values.clientId.trim(),
        displayName: values.displayName?.trim() || undefined,
        scope: shouldUseCustomScope(values.scope) ? values.scope : undefined,
      };

      setSingleError(null);
      setSingleResult(null);
      const result = await bindOAuthAccount(payload);
      setSingleResult(result);
      singleForm.setFieldValue("refreshToken", "");
      if (result.status === "skipped") {
        message.info(result.message);
      } else {
        message.success(result.message);
      }
    } catch (error) {
      if (isFormValidationError(error)) {
        return;
      }
      setSingleResult(null);
      setSingleError(error);
      message.error(getApiErrorMessage(error, "导入失败"));
    }
  };

  const handleBatchImport = async () => {
    try {
      const values = await batchForm.validateFields();
      const payload = parseBatchRecords(values.records);
      setBatchError(null);
      setBatchResult(null);
      setBatchPayload(payload);
      const result = await bindOAuthAccounts(payload);
      setBatchResult(result);

      const summary = `批量导入完成：共 ${result.total} 条，成功 ${result.success} 条，已跳过 ${result.skipped} 条，失败 ${result.failed} 条`;
      if (result.failed > 0) {
        message.warning(summary);
      } else if (result.skipped > 0) {
        message.info(summary);
      } else {
        message.success(summary);
      }
    } catch (error) {
      if (isFormValidationError(error)) {
        return;
      }
      setBatchResult(null);
      setBatchError(error);
      message.error(getApiErrorMessage(error, "批量导入失败"));
    }
  };

  const downloadFailedBatchRecords = () => {
    if (!batchResult) {
      return;
    }

    const failedRecords = batchResult.results.flatMap((result, index) =>
      result.status === "failed" && batchPayload[index]
        ? [batchPayload[index]]
        : [],
    );
    if (!failedRecords.length) {
      return;
    }

    const blob = new Blob([JSON.stringify(failedRecords, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "failed-oauth-import-records.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="page-grid">
      <div className="page-header-row">
        <div>
          <h2>{isAuthenticated ? "添加与绑定账户" : "登录邮件控制台"}</h2>
          <p>
            {isAuthenticated
              ? "选择与账号来源匹配的连接方式。"
              : "使用管理员凭据进入多账户邮件工作台。"}
          </p>
        </div>
      </div>

      <Card
        className={`surface-card auth-session-card ${isAuthenticated ? "authenticated" : ""}`}
      >
        <div className="card-title-row">
          <div>
            <h3>{isAuthenticated ? "管理员会话已连接" : "管理员登录"}</h3>
            <p>
              {isAuthenticated
                ? "账户绑定与同步接口均可用。"
                : "凭据只用于向本地邮件后端换取访问令牌。"}
            </p>
          </div>
          <Tag color={isAuthenticated ? "success" : "warning"}>
            {isAuthenticated ? "已认证" : "需要登录"}
          </Tag>
        </div>

        {!isAuthenticated && authError ? (
          <Alert
            className="compose-alert"
            description="请检查后端管理员凭据、环境变量或当前 Token 是否已失效。"
            message={authError}
            showIcon
            type="error"
          />
        ) : null}

        {isAuthenticated ? (
          <div className="authenticated-session-row">
            <div>
              <CheckCircleFilled />
              <span>
                已加载 {accounts.length} 个账户，可以继续添加或返回收件箱。
              </span>
            </div>
            <Button
              icon={<ArrowRightOutlined />}
              type="primary"
              onClick={() => navigate("/inbox")}
            >
              进入收件箱
            </Button>
          </div>
        ) : (
          <Form
            className="login-form"
            form={loginForm}
            layout="vertical"
            initialValues={{ username: "admin", password: "" }}
            onFinish={() => void handleLogin()}
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: true, message: "请输入用户名" }]}
            >
              <Input autoComplete="username" prefix={<UserOutlined />} />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: "请输入密码" }]}
            >
              <Input.Password
                autoComplete="current-password"
                prefix={<LockOutlined />}
              />
            </Form.Item>
            <Button htmlType="submit" type="primary" loading={isLoggingIn}>
              登录
            </Button>
          </Form>
        )}
      </Card>

      {isAuthenticated ? (
        <>
          <section
            className="binding-section"
            aria-labelledby="oauth-binding-title"
          >
            <div className="section-heading">
              <div>
                <span className="section-label">推荐方式</span>
                <h3 id="oauth-binding-title">OAuth 授权</h3>
              </div>
              <p>适合需要完整收发信能力的常用账户。</p>
            </div>
            <div className="auth-grid">
              {providerCards.map((card) => {
                const config = providerConfig[card.key];
                return (
                  <article key={card.key} className="provider-card">
                    <div className="provider-icon">{card.icon}</div>
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                    <p className="scope-hint">{card.scopeHint}</p>
                    <div className="provider-status">
                      <Space wrap>
                        <Tag color={config.enabled ? "success" : "warning"}>
                          {config.enabled ? "OAuth 可用" : "等待密钥配置"}
                        </Tag>
                        {config.callbackUrl ? <Tag>回调已配置</Tag> : null}
                      </Space>
                      <Button
                        type="primary"
                        disabled={!isAuthenticated}
                        loading={isBinding}
                        onClick={() => void handleBind(card.key)}
                      >
                        绑定账号
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <Card className="surface-card binding-card token-binding-card">
            <div className="card-title-row">
              <div>
                <h3>Token 直连导入（Microsoft OAuth）</h3>
                <p>
                  使用 refreshToken + clientId 直连绑定 Microsoft
                  账号，支持单个导入和批量粘贴。
                </p>
              </div>
              <Tag color="blue">
                <ThunderboltOutlined /> Token 直连
              </Tag>
            </div>

            <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
              批量粘贴支持两种格式：每行一个 JSON；或每行按
              <Typography.Text code style={{ marginInline: 8 }}>
                email, refreshToken, clientId, displayName, scope
              </Typography.Text>
              顺序输入，分隔符支持逗号、Tab、`|`。其中 `displayName` 和 `scope`
              都是可选列；不传 `scope` 时后端会自动使用默认值。
            </Typography.Paragraph>

            <Tabs
              items={[
                {
                  key: "single",
                  label: "单个导入",
                  children: (
                    <Space
                      direction="vertical"
                      size={16}
                      style={{ width: "100%" }}
                    >
                      {singleError ? (
                        <Alert
                          message={getApiErrorMessage(singleError, "导入失败")}
                          description={renderErrorDetails(singleError)}
                          showIcon
                          type="error"
                        />
                      ) : null}

                      {singleResult ? (
                        <Alert
                          message={
                            singleResult.status === "skipped"
                              ? "账号已存在，已跳过"
                              : "导入成功"
                          }
                          description={
                            <Space wrap>
                              <Typography.Text strong>
                                {singleResult.account.email}
                              </Typography.Text>
                              <Tag
                                color={
                                  singleResult.status === "skipped"
                                    ? "processing"
                                    : "success"
                                }
                              >
                                {singleResult.status === "skipped"
                                  ? "已跳过"
                                  : singleResult.account.status}
                              </Tag>
                            </Space>
                          }
                          showIcon
                          type={
                            singleResult.status === "skipped"
                              ? "info"
                              : "success"
                          }
                        />
                      ) : null}

                      <Form
                        form={singleForm}
                        layout="vertical"
                        onFinish={() => void handleSingleImport()}
                      >
                        <Form.Item
                          label="邮箱地址"
                          name="email"
                          rules={[
                            { required: true, message: "请输入邮箱地址" },
                            { type: "email", message: "请输入有效的邮箱地址" },
                          ]}
                        >
                          <Input
                            prefix={<MailOutlined />}
                            placeholder="owner@outlook.com"
                          />
                        </Form.Item>
                        <Form.Item
                          label="Refresh Token"
                          name="refreshToken"
                          rules={[
                            { required: true, message: "请输入 refreshToken" },
                          ]}
                        >
                          <Input.TextArea
                            autoSize={{ minRows: 3, maxRows: 6 }}
                            placeholder="微软 refresh token"
                          />
                        </Form.Item>
                        <Form.Item
                          label="Client ID"
                          name="clientId"
                          rules={[
                            { required: true, message: "请输入 clientId" },
                          ]}
                        >
                          <Input placeholder="public client id" />
                        </Form.Item>
                        <Form.Item label="显示名称" name="displayName">
                          <Input placeholder="可选；默认以后端 /me 返回为准" />
                        </Form.Item>
                        <Collapse
                          ghost
                          activeKey={advancedScopeOpen ? ["scope"] : []}
                          onChange={(keys) =>
                            setAdvancedScopeOpen(keys.includes("scope"))
                          }
                          items={[
                            {
                              key: "scope",
                              label: "高级选项",
                              children: (
                                <Form.Item
                                  label="Scope"
                                  name="scope"
                                  initialValue={[...defaultMicrosoftScopes]}
                                  extra="默认不传 scope，后端会自动使用推荐范围；只有需要自定义时才在这里调整。"
                                >
                                  <Select
                                    mode="multiple"
                                    options={scopeOptions}
                                    placeholder="选择需要的授权范围"
                                  />
                                </Form.Item>
                              ),
                            },
                          ]}
                        />
                        <Button
                          htmlType="submit"
                          type="primary"
                          disabled={!isAuthenticated}
                          loading={isBinding}
                        >
                          立即导入
                        </Button>
                      </Form>
                    </Space>
                  ),
                },
                {
                  key: "batch",
                  label: "批量导入",
                  children: (
                    <Space
                      direction="vertical"
                      size={16}
                      style={{ width: "100%" }}
                    >
                      {batchError ? (
                        <Alert
                          message={getApiErrorMessage(
                            batchError,
                            "批量导入失败",
                          )}
                          description={renderErrorDetails(batchError)}
                          showIcon
                          type="error"
                        />
                      ) : null}

                      {batchResult ? (
                        <Alert
                          message={
                            <Space wrap>
                              <span>
                                批量导入完成：共 {batchResult.total} 条，成功{" "}
                                {batchResult.success} 条，已跳过{" "}
                                {batchResult.skipped} 条，失败{" "}
                                {batchResult.failed} 条
                              </span>
                              {batchResult.failed > 0 ? (
                                <Button
                                  size="small"
                                  icon={<DownloadOutlined />}
                                  onClick={downloadFailedBatchRecords}
                                >
                                  下载失败数据 JSON
                                </Button>
                              ) : null}
                            </Space>
                          }
                          showIcon
                          type={
                            batchResult.failed > 0
                              ? "warning"
                              : batchResult.skipped > 0
                                ? "info"
                                : "success"
                          }
                        />
                      ) : null}

                      <Form
                        form={batchForm}
                        layout="vertical"
                        onFinish={() => void handleBatchImport()}
                      >
                        <Form.Item
                          label="账号记录"
                          name="records"
                          extra="支持 JSON 数组、逐行 JSON，或逗号 / 制表符分隔格式；超过 100 条时会自动分批提交。"
                          rules={[
                            { required: true, message: "请粘贴账号记录" },
                          ]}
                        >
                          <Input.TextArea
                            autoSize={{ minRows: 8, maxRows: 16 }}
                            placeholder={[
                              '[{"email":"owner@outlook.com","refreshToken":"xxx","clientId":"xxx"}]',
                              '{"email":"owner@outlook.com","refreshToken":"xxx","clientId":"xxx"}',
                              "owner1@outlook.com,refresh-token-1,client-id-1",
                              "owner2@outlook.com,refresh-token-2,client-id-2,Owner 2,https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access",
                              "owner3@outlook.com\trefresh-token-3\tclient-id-3",
                            ].join("\n")}
                          />
                        </Form.Item>
                        <Button
                          htmlType="submit"
                          type="primary"
                          disabled={!isAuthenticated}
                          loading={isBinding}
                        >
                          开始批量导入
                        </Button>
                      </Form>

                      {batchResult ? (
                        <List
                          bordered
                          dataSource={batchResult.results}
                          locale={{ emptyText: "暂无明细" }}
                          renderItem={(item) => (
                            <List.Item
                              actions={[
                                <Tag
                                  key="status"
                                  color={
                                    item.status === "success"
                                      ? "success"
                                      : item.status === "skipped"
                                        ? "processing"
                                        : "error"
                                  }
                                >
                                  {item.status === "success"
                                    ? "成功"
                                    : item.status === "skipped"
                                      ? "已跳过"
                                      : "失败"}
                                </Tag>,
                              ]}
                            >
                              <List.Item.Meta
                                title={
                                  <Typography.Text strong>
                                    {item.email}
                                  </Typography.Text>
                                }
                                description={
                                  item.status === "success"
                                    ? `${item.message} · accountId: ${item.accountId ?? "未返回"}`
                                    : item.message
                                }
                              />
                            </List.Item>
                          )}
                        />
                      ) : null}
                    </Space>
                  ),
                },
              ]}
            />
          </Card>

          <Card className="surface-card binding-card">
            <div className="card-title-row">
              <div>
                <h3>账号密码直连（Outlook / Hotmail / Gmail）</h3>
                <p>通过 IMAP/SMTP 直接绑定，无需走 OAuth 授权流程。</p>
              </div>
              <Tag color="blue">
                <KeyOutlined /> IMAP 直连
              </Tag>
            </div>

            <Form
              layout="vertical"
              onFinish={() => void handleBindCredentials()}
            >
              <Form.Item label="邮箱地址" required>
                <Input
                  prefix={<MailOutlined />}
                  placeholder="your-email@outlook.com 或 your-email@gmail.com"
                  value={imapEmail}
                  onChange={(event) => setImapEmail(event.target.value)}
                />
              </Form.Item>
              <Form.Item
                label="邮箱密码"
                required
                extra={
                  /^[^\s@]+@(gmail\.com|googlemail\.com)$/i.test(
                    imapEmail.trim(),
                  ) ? (
                    <Typography.Text type="warning" style={{ fontSize: 12 }}>
                      Gmail 须使用<strong>应用密码</strong>
                      （非账号登录密码）。请先开启两步验证，然后前往{" "}
                      <Typography.Link
                        href="https://myaccount.google.com/apppasswords"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        myaccount.google.com/apppasswords
                      </Typography.Link>{" "}
                      生成应用密码后填入此处。
                    </Typography.Text>
                  ) : null
                }
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder={
                    /^[^\s@]+@(gmail\.com|googlemail\.com)$/i.test(
                      imapEmail.trim(),
                    )
                      ? "Gmail 应用密码（16位）"
                      : "邮箱登录密码"
                  }
                  value={imapPassword}
                  onChange={(event) => setImapPassword(event.target.value)}
                />
              </Form.Item>
              <Button
                htmlType="submit"
                type="primary"
                disabled={!isAuthenticated}
                loading={isBinding}
              >
                绑定账号
              </Button>
            </Form>

            <Divider style={{ margin: "16px 0 8px" }} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              支持 <code>outlook.com</code>、<code>hotmail.com</code>、
              <code>live.com</code>、<code>gmail.com</code>
              。系统会自动识别对应的 IMAP/SMTP 服务并验证连通性。Gmail
              账号请使用应用密码（App Password）而非账号登录密码。
            </Typography.Text>
          </Card>

          <Card className="surface-card bound-accounts-card">
            <div className="card-title-row">
              <div>
                <h3>已绑定账号</h3>
                <p>展示账号状态、提供商信息和最近同步时间。</p>
              </div>
              <Tag color="blue">{accounts.length} 个账号</Tag>
            </div>

            <List
              className="bound-account-list"
              dataSource={accounts}
              pagination={
                accounts.length
                  ? {
                      current: boundAccountsPage,
                      pageSize: boundAccountsPageSize,
                      pageSizeOptions: ["8", "16", "32", "64"],
                      showLessItems: true,
                      showSizeChanger: true,
                      showTotal: (total) => `共 ${total} 个账号`,
                      size: "small",
                      onChange: (page, pageSize) => {
                        if (pageSize !== boundAccountsPageSize) {
                          setBoundAccountsPageSize(pageSize);
                          setBoundAccountsPage(1);
                          return;
                        }
                        setBoundAccountsPage(page);
                      },
                    }
                  : false
              }
              locale={{
                emptyText: isAuthenticated
                  ? "暂无已绑定账号"
                  : "请先登录以加载账号列表",
              }}
              renderItem={(account) => (
                <List.Item
                  actions={[
                    <Tag
                      key="status"
                      color={
                        account.status === "connected" ? "success" : "warning"
                      }
                    >
                      {account.status === "connected"
                        ? "已连接"
                        : account.status === "syncing"
                          ? "同步中"
                          : "需关注"}
                    </Tag>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      account.status === "connected" ? (
                        <CheckCircleFilled className="account-status-icon connected" />
                      ) : (
                        <SyncOutlined
                          className="account-status-icon attention"
                          spin={account.status === "syncing"}
                        />
                      )
                    }
                    title={
                      <Space wrap>
                        <Typography.Text strong>
                          {account.email}
                        </Typography.Text>
                        <Tag>{account.providerLabel}</Tag>
                      </Space>
                    }
                    description={`最近同步 ${dayjs(account.lastSyncAt).format("MM月DD日 HH:mm")} · ${dayjs(account.lastSyncAt).fromNow()} · ${account.unreadCount} 封未读`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </>
      ) : (
        <div className="auth-onboarding-panel">
          <span className="section-label">登录后可用</span>
          <h3>统一管理多种邮箱连接</h3>
          <p>
            登录后可使用 OAuth 授权、Microsoft Token 批量导入或 IMAP/SMTP
            密码直连，并集中查看连接状态。
          </p>
          <div className="onboarding-points">
            <span>
              <CheckCircleFilled /> OAuth 授权
            </span>
            <span>
              <CheckCircleFilled /> Token 批量导入
            </span>
            <span>
              <CheckCircleFilled /> 连接状态检查
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
