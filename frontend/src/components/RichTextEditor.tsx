import {
  BoldOutlined,
  ItalicOutlined,
  LinkOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { useEffect, useRef } from "react";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

type EditorCommand = "bold" | "italic" | "insertUnorderedList" | "createLink";

export default function RichTextEditor({
  value,
  onChange,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "<p></p>";
    }
  }, [value]);

  const runCommand = (command: EditorCommand) => {
    editorRef.current?.focus();
    if (command === "createLink") {
      const url = window.prompt("请粘贴链接地址");
      if (!url) {
        return;
      }
      document.execCommand(command, false, url);
      onChange(editorRef.current?.innerHTML ?? "");
      return;
    }

    document.execCommand(command, false);
    onChange(editorRef.current?.innerHTML ?? "");
  };

  return (
    <div className="editor-frame">
      <div className="editor-toolbar">
        <Tooltip title="加粗">
          <Button
            aria-label="加粗"
            icon={<BoldOutlined />}
            onClick={() => runCommand("bold")}
          />
        </Tooltip>
        <Tooltip title="斜体">
          <Button
            aria-label="斜体"
            icon={<ItalicOutlined />}
            onClick={() => runCommand("italic")}
          />
        </Tooltip>
        <Tooltip title="无序列表">
          <Button
            aria-label="无序列表"
            icon={<UnorderedListOutlined />}
            onClick={() => runCommand("insertUnorderedList")}
          />
        </Tooltip>
        <Tooltip title="插入链接">
          <Button
            aria-label="插入链接"
            icon={<LinkOutlined />}
            onClick={() => runCommand("createLink")}
          />
        </Tooltip>
      </div>
      <div
        ref={editorRef}
        className="editor-surface"
        contentEditable
        role="textbox"
        aria-label="邮件正文"
        aria-multiline="true"
        suppressContentEditableWarning
        onInput={() => onChange(editorRef.current?.innerHTML ?? "")}
      />
    </div>
  );
}
