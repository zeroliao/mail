import json

d = json.load(open("output/rm-raw.json", encoding="utf-8"))
rm = d["result"]["data"]["roadmap"]
tasks = rm["tasks"]


def clean(s):
    return s.encode("utf-8", "replace").decode("utf-8")


if not any(str(t.get("number")) == "20" for t in tasks):
    tasks.append({
        "id": max(t["id"] for t in tasks) + 1,
        "number": "20",
        "title": "线上Bug修复(hotmail取邮件502)：①清理 e2e mock 脏账号(e2e-owner@hotmail.com 软删除 ARCHIVED，池剩2个真实Gmail) ②自愈刷新重试—Graph provider 区分401(InvalidAuthenticationToken)、mail.service withTokenRetry 强制刷新后重试一次 ③e2e 测试自隔离临时库不再污染真实库。tsc 通过、10/10 测试通过",
        "status": "done",
        "pinned": False
    })

out = {
    "type": "roadmap.update",
    "payload": {
        "workspacePath": "C:\\Users\\Administrator\\Desktop\\code\\team",
        "conversationId": "01KV06N34EKHBJSNFZYXS03NZX",
        "roadmap": {
            "objective": clean(rm.get("objective", "")),
            "tasks": [
                {
                    "id": t["id"],
                    "number": t.get("number", ""),
                    "title": clean(t["title"]),
                    "status": t["status"],
                    "pinned": t.get("pinned", False)
                }
                for t in tasks
            ]
        }
    }
}

open("output/roadmap-update.json", "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print("built; tasks=", len(tasks))
