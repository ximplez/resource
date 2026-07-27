# feishu_bot_gateway 开发规范

本文件适用于 `feishu_bot_gateway` 目录下的所有代码、测试和文档改动。

## Feishu SDK 约束

- 与 Feishu OpenAPI 交互必须优先使用官方 `@larksuiteoapi/node-sdk`，不得绕过 SDK 自行实现通用 Feishu Client。
- tenant token 的获取、刷新、缓存和失效处理必须交给 SDK。项目代码不得新增自定义 token 请求、token cache、token refresh 或 KV token 读写逻辑。
- Feishu SDK 初始化、Worker 兼容配置和 SDK 访问封装必须集中在 `src/services/lark-client.js`，新增 Feishu 能力应复用该模块的 `getLarkClient`、`formatLarkPayload` 或 `requestLark`。
- 如果某个 Feishu API 的 SDK 传输实现与 Cloudflare Worker 不兼容，可以只替换该 API 的底层 HTTP 发送方式，但鉴权 headers 仍必须通过 SDK 生成，不能手写 tenant token 流程。
- 测试中可以 mock `getLarkClient`、`formatLarkPayload` 或 `requestLark` 的输出，但不要在业务代码或测试辅助中复制 SDK 的 token 获取协议作为项目逻辑。

## 实现原则

- 保持现有 `Authorization: Bearer <API_AUTH_TOKEN>` gateway 鉴权方式和多 app 配置结构兼容。
- 新增路由只负责 gateway 入参解析、校验和 Feishu 能力编排，避免把外部调用方的业务语义写入 gateway。
- 文档示例使用占位值，不写入真实 `appSecret`、gateway token 或接收人敏感信息。
