import { TagOutlined } from "@ant-design/icons";
import { App, Select } from "antd";
import { useEffect, useState } from "react";
import { getApiErrorMessage } from "../services/http";
import {
  MAX_ACCOUNT_LABEL_LENGTH,
  MAX_ACCOUNT_LABELS,
  normalizeAccountLabels,
} from "../utils/accountLabels";

type AccountLabelEditorProps = {
  accountEmail: string;
  availableLabels: string[];
  labels: string[];
  onChange: (labels: string[]) => Promise<unknown>;
  compact?: boolean;
};

export default function AccountLabelEditor({
  accountEmail,
  availableLabels,
  labels,
  onChange,
  compact = false,
}: AccountLabelEditorProps) {
  const { message } = App.useApp();
  const [value, setValue] = useState(labels);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(labels);
  }, [labels]);

  const handleChange = async (nextValue: string[]) => {
    const normalized = normalizeAccountLabels(nextValue);
    if (
      nextValue.some((label) => label.trim().length > MAX_ACCOUNT_LABEL_LENGTH)
    ) {
      message.error(`标签最多 ${MAX_ACCOUNT_LABEL_LENGTH} 个字符。`);
      return;
    }
    if (nextValue.length > MAX_ACCOUNT_LABELS) {
      message.error(`每个账号最多 ${MAX_ACCOUNT_LABELS} 个标签。`);
      return;
    }

    setValue(normalized);
    setSaving(true);
    try {
      await onChange(normalized);
      message.success(`已更新 ${accountEmail} 的标签`);
    } catch (error) {
      setValue(labels);
      message.error(getApiErrorMessage(error, "标签保存失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select
      aria-label={`编辑 ${accountEmail} 的标签`}
      className={`account-label-editor ${compact ? "compact" : ""}`}
      loading={saving}
      maxTagCount="responsive"
      mode="tags"
      options={availableLabels.map((label) => ({ label, value: label }))}
      placeholder="添加标签"
      suffixIcon={<TagOutlined />}
      tokenSeparators={[",", "，"]}
      value={value}
      onChange={(nextValue) => void handleChange(nextValue)}
    />
  );
}
