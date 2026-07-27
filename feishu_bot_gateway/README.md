# feishu_bot_gateway

Cloudflare Workers 上的飞书消息网关。调用方只需要请求统一 HTTP 接口，由 Worker 根据 `appId` 选择对应飞书应用，并向指定接收人发送消息。

内部实现使用飞书官方 Node SDK，并在 Worker 环境下通过 SDK 自带 axios 的 `fetch` adapter 发起请求，由 SDK 自动管理 tenant token 的获取与刷新。

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
- `msgType`: `text`、`post`、`interactive` 或 `image`
- `content`: 飞书消息内容对象

图片消息使用 `/upload_image` 返回的 `imageKey`：

```json
{
  "appId": "cli_xxx",
  "receiveIdType": "email",
  "receiveId": "name@example.com",
  "msgType": "image",
  "content": {
    "image_key": "img_v2_xxx"
  }
}
```

### `POST /upload_image`

上传用于飞书消息或卡片的图片，返回 `imageKey`。接口固定使用飞书 `image_type=message`。

推荐使用 `multipart/form-data` 直接上传文件：

```bash
curl -X POST 'https://your-worker.example.workers.dev/upload_image' \
  -H 'Authorization: Bearer your-api-token' \
  -F 'appId=cli_xxx' \
  -F 'image=@./status.png'
```

也可以用 JSON 上传 base64：

```json
{
  "appId": "cli_xxx",
  "base64": "data:image/png;base64,iVBORw0KGgoAAA...",
  "fileName": "status.png"
}
```

原始 base64 不包含 Data URL 头时，必须提供 `contentType` 或带扩展名的 `fileName`：

```json
{
  "appId": "cli_xxx",
  "base64": "iVBORw0KGgoAAA...",
  "contentType": "image/png",
  "fileName": "status.png"
}
```

还可以让 gateway 从公网 URL 获取图片后上传：

```json
{
  "appId": "cli_xxx",
  "url": "https://example.com/status.png",
  "fileName": "status.png"
}
```

响应示例：

```json
{
  "success": true,
  "data": {
    "imageKey": "img_v2_xxx",
    "fileName": "status.png",
    "contentType": "image/png",
    "size": 12345
  }
}
```

### `POST /send_card`

飞书模板卡片专用接口。需要鉴权。

该接口只支持飞书卡片模板方式，不支持手写普通卡片结构。未传 `messageId` 时会发送新卡片；传入 `messageId` 时会更新已有卡片。

Worker 会把请求组装成飞书 `msg_type=interactive`，并生成如下内容：

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
- `messageId`: 可选。传入后更新该飞书消息卡片；不传则发送新卡片

#### 卡片内联上传图片

`send_card` 可通过 `images` 在一次请求中完成“上传图片 -> 获得 `image_key` -> 注入模板变量 -> 发送或更新卡片”。

卡片模板需要先创建图片变量，例如 `cover_image`，并把图片组件的图片 key 绑定为 `${cover_image}`。请求中 `images[].variable` 必须与模板变量名一致。

Feishu 卡片模板的图片变量是 `Image` 类型，实际传入的模板变量值必须是对象结构，而不是直接传 `image_key` 字符串。gateway 会自动把上传得到的 `image_key` 包装为 `{ "img_key": "img_v3_xxx" }`。

模板中的图片组件示例：

```json
{
  "tag": "img",
  "img_key": "${cover_image}",
  "alt": {
    "tag": "plain_text",
    "content": "执行截图"
  },
  "mode": "fit_horizontal",
  "preview": true
}
```

gateway 请求示例：

```json
{
  "appId": "cli_xxx",
  "receiveIdType": "email",
  "receiveId": "name@example.com",
  "templateId": "AAq2HMaiGq246",
  "templateVariable": {
    "app_name": "feishu_bot_gateway",
    "title": "嵌入图片卡片",
    "sub_title": "2026-07-27 12:00:00",
    "title_style": "blue",
    "content": "**执行完成**\n图片会显示在模板图片组件绑定的 `${cover_image}` 位置。",
    "foot": "gateway 会上传图片并把 image_key 注入 cover_image",
    "open_id": "",
    "main_button_text": "已完成",
    "main_button": true,
    "main_button_event": {},
    "sub_button_text": "查看文档",
    "sub_button": false,
    "sub_button_url": "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/image/create"
  },
  "images": [
    {
      "variable": "cover_image",
      "base64": "data:image/png;base64,iVBORw0KGgoAAA...",
      "fileName": "cover.png"
    }
  ]
}
```

发送前 gateway 会将上传得到的 `image_key` 合并到模板变量中，效果等价于：

```json
{
  "template_variable": {
    "cover_image": {
      "img_key": "img_v3_xxx"
    }
  }
}
```

#### 无图场景的排版处理

如果某次卡片不需要展示图片，不要给图片变量传空字符串、`null`、`{}` 或 `{ "img_key": "" }`。飞书卡片模板的图片变量仍会按 `Image` 类型校验，空值不等价于隐藏组件，也可能导致发送失败或让图片组件继续占用布局空间。

飞书卡片当前不支持通过模板变量控制普通组件的显示或隐藏。需要“无图时不影响排版”时，推荐在模板层准备两套布局：

- 有图模板：包含图片组件，图片组件绑定 `cover_image` 等 `Image` 变量，gateway 通过 `images` 上传并注入 `{ "img_key": "img_v3_xxx" }`
- 无图模板：移除图片组件，保留文本、按钮等其它内容；发送或更新卡片时切换到这个模板

同一条卡片消息可以通过 `messageId` 更新为有图或无图模板：

```json
{
  "appId": "cli_xxx",
  "messageId": "om_xxx",
  "templateId": "ctp_without_image_xxx",
  "templateVariable": {
    "title": "执行结果",
    "content": "本次没有截图，卡片布局不会预留图片区域。"
  }
}
```

只有富文本内容适合通过传空文本来弱化展示；图片组件这类结构化组件应通过模板拆分来控制是否参与排版。

gateway 无法通过 `templateId` 读取飞书卡片搭建工具里的远程模板结构，也无法自动推断模板中有哪些 `Image` 变量。接入方必须在 `images` 中显式声明图片变量名，例如 `content_image`。如果调用方必须复用有图模板，但本次没有业务图片，可以保留变量名并让图片资源为空；gateway 会自动使用内置透明占位图，并在 Worker 实例内按 `appId` 懒上传和缓存占位图 `image_key`。

占位图只解决“有图模板必须传图片变量才能发送”的兼容问题。图片组件自身的 `margin`、标题或模板中配置的固定高度仍可能影响最终排版；如果要求完全不占位，仍应使用无图模板。

自动使用占位图的 JSON 示例：

```json
{
  "appId": "cli_xxx",
  "receiveIdType": "email",
  "receiveId": "name@example.com",
  "templateId": "ctp_with_image_xxx",
  "templateVariable": {
    "title": "执行结果"
  },
  "images": [
    {
      "variable": "content_image"
    }
  ]
}
```

也可以显式把图片资源置为空，语义相同：

```json
{
  "appId": "cli_xxx",
  "templateId": "ctp_with_image_xxx",
  "images": [
    {
      "variable": "content_image",
      "url": ""
    }
  ]
}
```

内置占位图文件也保留在仓库中，便于本地 multipart 手工调试：[transparent-card-placeholder-1200x1.png](/Users/bytedance/Documents/worker-resource/resource/feishu_bot_gateway/assets/transparent-card-placeholder-1200x1.png)。该图片为 `1200x1`、RGBA 全透明 PNG，配合图片组件的 `fit_horizontal` 展示模式时，高度会被压到接近不可见。

手工 multipart 调试示例：

```bash
curl -X POST 'https://your-worker.example.workers.dev/send_card' \
  -H 'Authorization: Bearer your-api-token' \
  -F 'payload={
    "appId":"cli_xxx",
    "receiveIdType":"email",
    "receiveId":"name@example.com",
    "templateId":"ctp_with_image_xxx",
    "templateVariable":{"title":"执行结果"}
  }' \
  -F 'imageMap=[{"variable":"content_image"}]' \
  -F 'image=@./assets/transparent-card-placeholder-1200x1.png'
```

通过公网 URL 上传并嵌入卡片：

```json
{
  "appId": "cli_xxx",
  "receiveIdType": "email",
  "receiveId": "name@example.com",
  "templateId": "ctp_xxx",
  "templateVariable": {
    "title": "执行结果"
  },
  "images": [
    {
      "variable": "cover_image",
      "url": "https://example.com/status.png",
      "fileName": "status.png"
    }
  ]
}
```

通过 base64 上传并嵌入卡片：

```json
{
  "appId": "cli_xxx",
  "templateId": "ctp_xxx",
  "templateVariable": {
    "title": "执行结果"
  },
  "images": [
    {
      "variable": "cover_image",
      "base64": "data:image/png;base64,iVBORw0KGgoAAA..."
    }
  ]
}
```

`content` 模式同样支持 `images`。gateway 会把上传结果合并到 `content.data.template_variable`。

`content` 模式示例：

```json
{
  "appId": "cli_xxx",
  "receiveIdType": "email",
  "receiveId": "name@example.com",
  "content": {
    "type": "template",
    "data": {
      "template_id": "AAq2HMaiGq246",
      "template_variable": {
        "app_name": "feishu_bot_gateway",
        "title": "content 模式嵌入图片",
        "content": "图片变量会合并到 content.data.template_variable"
      }
    }
  },
  "images": [
    {
      "variable": "cover_image",
      "url": "https://example.com/cover.png",
      "fileName": "cover.png"
    }
  ]
}
```

使用本地文件时，将 `send_card` 改为 multipart 请求：

```bash
curl -X POST 'https://your-worker.example.workers.dev/send_card' \
  -H 'Authorization: Bearer your-api-token' \
  -F 'payload={
    "appId":"cli_xxx",
    "receiveIdType":"email",
    "receiveId":"name@example.com",
    "templateId":"ctp_xxx",
    "templateVariable":{"title":"执行结果"}
  }' \
  -F 'imageMap=[{"variable":"cover_image"},{"variable":"detail_image"}]' \
  -F 'image=@./cover.png' \
  -F 'image=@./detail.jpg'
```

`imageMap` 与重复出现的 `image` 字段按顺序一一对应。响应中的 `data.images` 会返回每张图片的 `variable` 和 `imageKey`，方便后续复用。

更新卡片示例：

```json
{
  "appId": "cli_xxx",
  "messageId": "om_xxx",
  "templateId": "AAq2HMaiGq246",
  "templateVariable": {
    "app_name": "yak",
    "title": "更新后的标题"
  }
}
```

图片限制遵循飞书官方上传图片接口：

- 支持 JPEG、PNG、WEBP、GIF、TIFF、BMP、ICO
- 单张图片不能为 0 字节，且不能超过 10 MB
- 单次 `send_card` 最多内联上传 5 张图片
- URL 仅支持 `http` / `https` 公网地址，并拒绝明显的本机、链路本地和私网 IP
- 飞书应用必须开启机器人能力，并具备上传图片和发送消息所需权限

官方文档：

- [上传图片](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/image/create)
- [卡片图片组件](https://open.feishu.cn/document/feishu-cards/feishu-card-cardkit/components/image)
- [配置卡片变量](https://open.feishu.cn/document/feishu-cards/feishu-card-cardkit/configure-card-variables)

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

### 模板结构校验

gateway 默认不会读取飞书远程模板结构，也不会阻断未配置结构的模板请求。需要提前发现强类型变量错误时，可以在 Cloudflare Worker 变量中按模板 ID 配置卡片结构 JSON。变量名格式为：

```text
CARD_TEMPLATE_SCHEMA_<templateId>
```

例如模板 ID 为 `AAqWXbpoNRj3B` 时，对应变量名为：

```text
CARD_TEMPLATE_SCHEMA_AAqWXbpoNRj3B
```

变量值填写卡片搭建工具导出的完整 schema JSON 字符串。gateway 只在命中对应变量时进行补齐和校验；没有配置、模板 ID 不匹配或使用其它模板时，会跳过模板结构处理并保持原有发送行为。

当前只校验会导致飞书卡片创建或更新失败的强类型变量：

- 图片组件 `img_key` 绑定的 `Image` 变量：最终模板变量必须是 `{ "img_key": "img_v3_xxx" }`
- `disabled`、`preview`、`transparent` 等布尔字段绑定的变量：必须是 `boolean`
- 回调按钮 `behaviors[].value` 绑定的变量：必须是对象

普通 markdown、plain_text、URL、颜色、样式等字符串变量不做强校验，避免把可容错的文案缺省变成 gateway 阻断。

配置示例：

```toml
[vars]
CARD_TEMPLATE_SCHEMA_AAqWXbpoNRj3B = """
{
  "schema": "2.0",
  "body": {
    "elements": [
      {
        "tag": "img",
        "img_key": "${content_image}"
      },
      {
        "tag": "button",
        "disabled": "${main_button}",
        "behaviors": [
          {
            "type": "callback",
            "value": "${main_button_event}"
          }
        ]
      }
    ]
  }
}
"""
```

如果模板中包含图片组件并绑定了 `content_image`，调用方可以通过 `images` 上传真实图片。若请求没有传 `content_image` 模板变量，也没有在 `images` 中声明该变量，gateway 会根据模板结构自动追加一个空图片源，并注入透明占位图。

自动补齐严格按模板中的图片变量名执行。例如模板同时包含 `img_key: "${content_image}"` 和 `img_key: "${detail_image}"` 时，gateway 会分别检查这两个变量；调用方已经通过 `templateVariable` 或 `images` 传入的图片变量不会重复补齐，只会为缺失的图片变量追加占位图。

```json
{
  "templateId": "AAqWXbpoNRj3B",
  "templateVariable": {
    "main_button": true,
    "main_button_event": {
      "action": "noop"
    }
  }
}
```

如果没有配置对应的 `CARD_TEMPLATE_SCHEMA_<templateId>`，gateway 无法知道模板里有哪些图片变量，此时仍需要调用方显式传 `images: [{ "variable": "content_image" }]` 才能触发透明占位图。

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

说明：

- 该项目依赖 `@larksuiteoapi/node-sdk`
- Worker 环境通过 `nodejs_compat` + axios 内置 `fetch` adapter 运行
- tenant token 由 SDK 自动缓存与刷新，不再在项目代码中手写 token 请求逻辑

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
