import { TagOutlined } from "@ant-design/icons";
import { App, Input, Select, Tag } from "antd";
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
  serviceNotes?: Record<string, string>;
  onChange: (
    labels: string[],
    serviceNotes?: Record<string, string>,
  ) => Promise<unknown>;
  compact?: boolean;
};

export default function AccountLabelEditor({
  accountEmail,
  availableLabels,
  labels,
  serviceNotes = {},
  onChange,
  compact = false,
}: AccountLabelEditorProps) {
  const { message } = App.useApp();
  const [value, setValue] = useState(labels);
  const [notes, setNotes] = useState(serviceNotes);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(labels);
    setNotes(serviceNotes);
  }, [labels, serviceNotes]);

  const normalizedNotes = (nextLabels: string[], nextNotes = notes) =>
    Object.fromEntries(
      nextLabels
        .map((label) => [label, nextNotes[label]?.trim() ?? ""])
        .filter(([, note]) => Boolean(note)),
    );

  const save = async (nextLabels: string[], nextNotes = notes) => {
    const nextServiceNotes = normalizedNotes(nextLabels, nextNotes);
    setValue(nextLabels);
    setNotes(nextServiceNotes);
    setSaving(true);
    try {
      await onChange(nextLabels, nextServiceNotes);
      message.success(`已更新 ${accountEmail} 的服务标签`);
    } catch (error) {
      setValue(labels);
      setNotes(serviceNotes);
      message.error(getApiErrorMessage(error, "服务标签保存失败"));
    } finally {
      setSaving(false);
    }
  };

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

    await save(normalized);
  };

  const updateNote = (label: string, note: string) => {
    const nextNotes = { ...notes, [label]: note };
    setNotes(nextNotes);
    void save(value, nextNotes);
  };

  return (
    <div className={`account-label-editor ${compact ? "compact" : ""}`}>
      <Select
        aria-label={`编辑 ${accountEmail} 的服务标签`}
        loading={saving}
        maxTagCount="responsive"
        mode="tags"
        options={availableLabels.map((label) => ({ label, value: label }))}
        placeholder="添加服务标签"
        suffixIcon={<TagOutlined />}
        tokenSeparators={[",", "，"]}
        value={value}
        onChange={(nextValue) => void handleChange(nextValue)}
      />
      {value.length ? (
        <div className="service-note-list" aria-label="服务账号备注">
          {value.map((label) => (
            <label className="service-note-row" key={label}>
              <Tag>{label}</Tag>
              <Input
                aria-label={`${label} 服务备注`}
                maxLength={160}
                placeholder="备注账号、登录名或用途"
                size="small"
                value={notes[label] ?? ""}
                onChange={(event) =>
                  setNotes({ ...notes, [label]: event.target.value })
                }
                onBlur={() => updateNote(label, notes[label] ?? "")}
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
