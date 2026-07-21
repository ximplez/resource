# feishu_bot_gateway

Cloudflare Workers 上的飞书消息网关。调用方只需要请求统一 HTTP 接口，由 Worker 根据 `appId` 选择对应飞书应用，并向指定接收人发送消息。

## API

### `GET /health`

Worker 健康检查。

### `POST /send`

通用飞书消息发送接口。需要鉴权。

```bash
curl -X POST 'https://your-worker.example.workers.dev/send' \
  -H 'Authorization: Bearer your-api-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "appId": "cli_xxx",
    "receiveIdType": "open_id",
    "receiveId": "ou_xxx",
    "msgType": "text",
    "content": {
      "text": "hello from cloudflare worker"
    }
  }'
```

字段说明：

- `appId`: 飞书应用 ID，用于选择机器人配置
- `receiveIdType`: `open_id`、`user_id`、`union_id`、`email` 或 `chat_id`
- `receiveId`: 接收人 ID 或群 ID
- `msgType`: `text`、`post` 或 `interactive`
- `content`: 飞书消息内容对象

### `POST /send_card`

飞书模板卡片专用接口。需要鉴权。

该接口只支持飞书卡片模板方式，不支持手写普通卡片结构。Worker 会把请求组装成飞书 `msg_type=interactive`，并生成如下内容：

```json
{
  "type": "template",
  "data": {
    "template_id": "ctp_xxx",
    "template_version_name": "1.0.0",
    "template_variable": {}
  }
}
```

请求示例：

```json
{
  "appId": "cli_xxx",
  "receiveIdType": "email",
  "receiveId": "name@example.com",
  "content": "{\"type\":\"template\",\"data\":{\"template_id\":\"AAq2HMaiGq246\",\"template_variable\":{\"app_name\":\"yak\",\"title\":\"title\"}}}"
}
```

字段说明：

- `templateId`: 飞书卡片模板 ID，对应飞书文档中的 `template_id`
- `templateVersionName`: 可选，对应 `template_version_name`
- `templateVariable`: 可选，对应 `template_variable`
- `content`: 可选，飞书模板卡片内容 JSON 字符串或对象。传入后会优先使用 `content`，此时不需要 `templateId`
- `receiveIdType` / `receiveId`: 可选。如果应用配置里设置了默认接收人，可以不传

## 配置

通过 Cloudflare secrets 配置：

```bash
wrangler secret put API_AUTH_TOKEN
wrangler secret put FEISHU_APPS_JSON
```

`FEISHU_APPS_JSON` 示例：

```json
{
  "cli_xxx": {
    "appId": "cli_xxx",
    "appSecret": "your-app-secret",
    "defaultIdType": "email",
    "defaultReceiveId": "name@example.com"
  },
  "cli_yyy": {
    "appId": "cli_yyy",
    "appSecret": "another-app-secret"
  }
}
```

可选配置 KV 缓存 tenant token：

```toml
[[kv_namespaces]]
binding = "FEISHU_TOKEN_KV"
id = "your-kv-namespace-id"
```

不配置 KV 时会使用 Worker 实例内存缓存，低频调用也可以正常工作。

## 本地开发

安装依赖：

```bash
npm install
```

语法检查：

```bash
npm run check
```

本地运行：

```bash
npm run dev
```

部署：

```bash
npm run deploy
```

## 安全约束

- 所有发送接口都需要 `Authorization: Bearer <API_AUTH_TOKEN>`
- `appId` 必须存在于 `FEISHU_APPS_JSON`
- 单次请求体和消息内容做了基础大小限制
- 返回和日志不会暴露飞书 `appSecret`
