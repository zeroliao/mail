import json

text = open("output/bug-report.txt", encoding="utf-8").read()
payload = {
    "type": "chat.send",
    "payload": {
        "workspacePath": "C:\\Users\\Administrator\\Desktop\\code\\team",
        "conversationId": "01KV06N34EKHBJSNFZYXS03NZX",
        "senderId": "01KV0Y3GK3762SKYGDS53NHHKB",
        "text": text,
        "mentionIds": ["01KV0XW580FSCGJR0RGHDYAAC8", "01KV0Y0T6VP8GWP7GRBF5D4V2Y"]
    }
}
open("output/send-bug.json", "w", encoding="utf-8").write(json.dumps(payload, ensure_ascii=False))
print("built")
