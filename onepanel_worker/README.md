# onepanel_worker

`onepanel_worker` 是一个基于请求驱动的 1Panel 自动化 Cloudflare Worker。

当前提供以下核心动作：

- `upgrade-container`
- `create-container`
- `health-check`

同时保留私有镜像仓库同步能力：

- 根据目标镜像识别 registry host
- 仅在目标镜像使用 Docker Hub 且未配置 Docker Hub 凭据时跳过仓库同步
- 查找 1Panel 中已有的镜像仓库配置
- 在升级或创建容器前触发仓库状态检查
- 在状态不是 `Success` 时用配置中的凭据更新已有仓库
- 当 1Panel 中不存在目标 registry 时，根据配置创建新的镜像仓库
- 确认 registry 凭据同步后，由 1Panel 的创建/升级 API 执行同步拉取

## 运行模型

Worker 采用请求驱动模型：

- 本地文件输入转换为 JSON 请求体或 Worker secrets
- CLI flags 转换为 HTTP 字段
- 周期性健康检查使用 Worker cron trigger

## 源码结构

Worker 按职责拆分实现：

- `src/index.js`: Worker 入口和路由分发
- `src/actions/`: action handlers
- `src/config/`: 请求、env、默认值归一化
- `src/onepanel/`: 1Panel auth、client 和 registry sync
- `src/notifications/`: Feishu card 消息模型和 gateway 通知
- `src/lib/`: 通用 HTTP 和对象处理工具

## 接口

### `GET /health`

Worker 健康检查。

### `POST /run`

通用 action 入口，请求体必须包含 `action`。

支持的 actions：

- `upgrade-container`
- `create-container`
- `health-check`

### `POST /upgrade-container`

升级容器。

请求示例：

```bash
curl -X POST 'http://127.0.0.1:8787/upgrade-container' \
  -H 'Authorization: Bearer your-api-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "containerName": "nginx",
    "image": "nginx:1.27.0",
    "forcePull": true
  }'
```

可选字段：

- `createIfMissing`: 为 `true` 时，如果容器不存在则自动创建
- `containerConfig`: `createIfMissing=true` 时使用的创建配置
- `onepanel`: 单次请求级别的 `baseUrl`、`apiKey`、`apiPrefix` 覆盖配置
- `dockerRegistryConfig`: 单次请求级别的 registry 凭据映射
- `notification`: 单次请求级别的 Feishu card 通知覆盖配置

### `POST /create-container`

创建并启动容器。

请求示例：

```bash
curl -X POST 'http://127.0.0.1:8787/create-container' \
  -H 'Authorization: Bearer your-api-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "containerConfig": {
      "name": "nginx",
      "image": "nginx",
      "version": "1.27.0",
      "forcePull": true,
      "networkName": "bridge",
      "port": {
        "8080": "80"
      },
      "env": {
        "TZ": "Asia/Shanghai"
      },
      "mount": {
        "/data/nginx/conf": "/etc/nginx/conf.d"
      },
      "restartPolicy": "always"
    }
  }'
```

Worker 接受以下任一写法：

- `containerConfig`
- `dockerConfig`
- 直接把创建字段放在请求体顶层

完整 `containerConfig` 示例：

```json
{
  "containerConfig": {
    "name": "yak",
    "image": "ghcr.io/ximplez-go/yak",
    "version": "latest",
    "forcePull": true,
    "networkName": "bridge",
    "ipv4": "",
    "ipv6": "",
    "publishAllPorts": false,
    "exposedPorts": [
      {
        "hostIP": "0.0.0.0",
        "hostPort": "8080",
        "containerPort": "8080",
        "protocol": "tcp"
      },
      {
        "hostIP": "127.0.0.1",
        "hostPort": "9090",
        "containerPort": "9090",
        "protocol": "udp"
      }
    ],
    "env": [
      "TZ=Asia/Shanghai",
      "LOG_LEVEL=info",
      "HTTP_PROXY=http://proxy.example.com:7890"
    ],
    "volumes": [
      {
        "type": "bind",
        "sourceDir": "/opt/yak/config",
        "containerDir": "/app/config",
        "mode": "rw"
      },
      {
        "type": "bind",
        "sourceDir": "/opt/yak/data",
        "containerDir": "/app/data",
        "mode": "rw"
      },
      {
        "type": "volume",
        "sourceDir": "yak-cache",
        "containerDir": "/app/cache",
        "mode": "rw"
      }
    ],
    "restartPolicy": "unless-stopped",
    "cmd": ["serve", "--config", "/app/config/config.yaml"],
    "entrypoint": [],
    "tty": false,
    "openStdin": false,
    "privileged": false,
    "autoRemove": false,
    "labels": [
      "app=yak",
      "managed-by=onepanel-worker"
    ],
    "cpuShares": 1024,
    "nanoCPUs": 1.5,
    "memory": 512
  },
  "dockerRegistryConfig": {
    "github": {
      "registry": "ghcr.io",
      "username": "github-user",
      "password": "github-token-with-read-packages"
    }
  }
}
```

字段说明：

- `name` 和 `image` 是 1Panel 必填字段。如果 `image` 未带 tag 且设置了 `version`，Worker 会向 1Panel 发送 `image:version`。
- `forcePull=true` 表示即使本地已有匹配镜像，也要求 1Panel 重新拉取镜像。
- `networkName` 会映射为 1Panel 的 `network` 字段。内置值包括 `bridge`、`host`、`none`，自定义 Docker network 名称也会原样传递。
- `exposedPorts` 用于配置宿主机端口到容器端口的映射。`protocol` 通常是 `tcp` 或 `udp`；`hostIP` 可填写 `0.0.0.0`、`127.0.0.1` 或宿主机地址。
- `env` 会以 `KEY=value` 字符串数组发送给 1Panel。Worker 也兼容对象写法，例如 `{ "TZ": "Asia/Shanghai" }`。
- `volumes` 支持 bind mounts 和 Docker named volumes。`type=bind` 时 `sourceDir` 是宿主机路径；`type=volume` 时 `sourceDir` 是 volume 名称。`mode` 常用 `rw` 或 `ro`。
- `restartPolicy` 会通过 1Panel 直接传给 Docker。常见值为 `no`、`always`、`unless-stopped`、`on-failure`；1Panel 对 `on-failure` 固定设置最大重试次数为 5。
- `memory` 单位是 MB。`nanoCPUs` 使用 CPU 核数表达，例如 `1.5` 表示 1.5 核。`cpuShares` 是 Docker 的相对权重模型，常用默认值为 `1024`。
- `cmd` 和 `entrypoint` 都是数组。留空时使用镜像默认值。
- `labels` 是 `key=value` 字符串数组。
- `privileged`、`autoRemove`、`tty`、`openStdin` 会直接映射到 Docker/1Panel 容器选项。

兼容简写：

```json
{
  "containerConfig": {
    "name": "nginx",
    "image": "nginx",
    "version": "1.27.0",
    "networkName": "bridge",
    "port": {
      "8080": "80"
    },
    "env": {
      "TZ": "Asia/Shanghai"
    },
    "mount": {
      "/data/nginx/conf": "/etc/nginx/conf.d"
    },
    "restartPolicy": "always"
  }
}
```

简写 `port` map 会转换为 `exposedPorts`，默认 `hostIP=0.0.0.0`、`protocol=tcp`。`mount` map 会转换为 bind `volumes`，默认 `mode=rw`。

### `POST /health-check`

检查 1Panel 可达性和目标容器状态。

请求示例：

```bash
curl -X POST 'http://127.0.0.1:8787/health-check' \
  -H 'Authorization: Bearer your-api-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "containers": ["nginx", "yak"]
  }'
```

健康检查失败时返回 HTTP `200`，并在响应体中设置 `healthy: false`。这样可以在上报异常的同时避免把整个执行流程变成硬失败。鉴权失败或输入非法仍会返回 `4xx` 或 `5xx`。

该接口接受以下任一写法：

- `containers`: 推荐的列表写法，用于检查多个容器
- `containerNames`: 列表别名写法
- `containerName`: 向后兼容的单容器写法

默认行为：

- `health-check` 只在不健康时发送 Feishu card
- `upgrade-container` 和 `create-container` 会先发送 preview card，动作完成后再把同一张卡片更新为最终结果

## 配置

在 Cloudflare 中配置 secrets 或 vars：

```bash
wrangler secret put API_AUTH_TOKEN
wrangler secret put ONEPANEL_CONFIG_JSON
wrangler secret put NOTIFICATION_CONFIG_JSON
wrangler secret put DOCKER_REGISTRY_CONFIG_JSON
wrangler secret put DEFAULTS_CONFIG_JSON
```

最小运行配置：

- `API_AUTH_TOKEN`
- `ONEPANEL_CONFIG_JSON`

可选配置：

- `NOTIFICATION_CONFIG_JSON`
- `DOCKER_REGISTRY_CONFIG_JSON`
- `DEFAULTS_CONFIG_JSON`

`API_AUTH_TOKEN` 保持为顶层鉴权变量。业务配置按模块聚合。

`ONEPANEL_CONFIG_JSON` 示例：

```json
{
  "baseUrl": "https://your-onepanel.example.com",
  "apiKey": "your-onepanel-api-key",
  "apiPrefix": "/api/v1",
  "defaultContainerName": "yak"
}
```

`NOTIFICATION_CONFIG_JSON` 示例：

```json
{
  "gatewayBaseUrl": "https://your-feishu-bot-gateway.example.workers.dev",
  "gatewayAuthToken": "your-gateway-token",
  "appId": "cli_xxx",
  "templateId": "AAq2HMaiGq246",
  "templateVersionName": "1.0.0",
  "receiveIdType": "email",
  "receiveId": "name@example.com",
  "appName": "1PanelWorker",
  "card": {
    "subButtonText": "打开 1Panel",
    "subButtonUrl": "https://your-onepanel.example.com",
    "mainButtonDisabled": true,
    "mainButtonEvent": {}
  }
}
```

Feishu 通知通过 `feishu_bot_gateway` 的 `POST /send_card` 发送，不再使用旧的自定义 webhook JSON payload。
模板应使用 interactive card 变量 `content`、`foot`、`main_button_text`、`main_button`、`main_button_event`、`sub_button_text`、`sub_button`、`sub_button_url` 和 `title_style`。`main_button_event` / `mainButtonEvent` 始终会按 JSON object 发送。

对于 `upgrade-container` 和 `create-container`，`onepanel_worker` 使用两阶段通知流程：

- 先发送 preview template card
- action 完成后，使用返回的 `messageId` 更新同一条 Feishu 消息为最终结果

Card 默认样式针对 1Panel 运维场景做了调整：

- preview cards 使用黄色 header，并在 action 运行时禁用 callback button
- success cards 使用绿色 header，并展示最终的 container/image/repository 摘要
- failure 和不健康的 health-check cards 使用红色 header，并尽可能更新同一条消息
- secondary button 打开 1Panel console URL；如果未设置 `card.subButtonUrl`，会从 `ONEPANEL_CONFIG_JSON.baseUrl` 推导
- primary callback button 默认禁用，除非 `card.mainButtonEvent` 配置为 object 且 `card.mainButtonDisabled` 显式为 `false`

发送 card 所需的通知配置：

- `NOTIFICATION_CONFIG_JSON.gatewayBaseUrl`
- `NOTIFICATION_CONFIG_JSON.gatewayAuthToken`
- `NOTIFICATION_CONFIG_JSON.appId`
- `NOTIFICATION_CONFIG_JSON.templateId`

可选 gateway 配置：

- `NOTIFICATION_CONFIG_JSON.templateVersionName`
- `NOTIFICATION_CONFIG_JSON.receiveIdType`
- `NOTIFICATION_CONFIG_JSON.receiveId`
- `NOTIFICATION_CONFIG_JSON.appName`
- `NOTIFICATION_CONFIG_JSON.enabled`
- `NOTIFICATION_CONFIG_JSON.card.subButtonText`
- `NOTIFICATION_CONFIG_JSON.card.subButtonUrl`
- `NOTIFICATION_CONFIG_JSON.card.mainButtonText`
- `NOTIFICATION_CONFIG_JSON.card.mainButtonDisabled`
- `NOTIFICATION_CONFIG_JSON.card.mainButtonEvent` object
- `NOTIFICATION_CONFIG_JSON.card.openId`
- `NOTIFICATION_CONFIG_JSON.card.successFoot`
- `NOTIFICATION_CONFIG_JSON.card.failureFoot`

发送给 `feishu_bot_gateway` 的模板变量包括：

- `app_name` / `appName`
- `title`
- `sub_title` / `subTitle`
- `title_style` / `titleStyle`
- `status`
- `action`
- `content`
- `foot`
- `main_button_text` / `mainButtonText`
- `main_button` / `mainButton`
- `main_button_event` / `mainButtonEvent`
- `sub_button_text` / `subButtonText`
- `sub_button` / `subButton`
- `sub_button_url` / `subButtonUrl`
- `open_id` / `openId`
- `container_name` / `containerName`
- `image`
- `current_image` / `currentImage`
- `target_image` / `targetImage`
- `success_content` / `successContent`
- `failure_info` / `failureInfo`
- `base_url` / `baseUrl`
- `timestamp`
- `detail`
- `repo_sync` / `repoSync`

`DOCKER_REGISTRY_CONFIG_JSON` 使用如下顶层 object 结构：

```json
{
  "Ali-shenzhen": {
    "registry": "registry.cn-shenzhen.aliyuncs.com",
    "username": "your-username",
    "password": "your-password"
  }
}
```

`DEFAULTS_CONFIG_JSON` 可提供按 action 划分的默认配置：

```json
{
  "healthCheck": {
    "containers": ["nginx", "yak"]
  }
}
```

本地开发时，`example.env.json` 使用同名模块对象：`onepanel`、`notification`、`dockerRegistry` 和 `defaults`。在 Cloudflare vars 中使用上文的 JSON-string 变量。

仍兼容 `ONEPANEL_BASE_URL`、`FEISHU_BOT_GATEWAY_BASE_URL`、`DOCKER_REGISTRY_JSON`、`WORKER_DEFAULTS_JSON` 等旧的扁平变量作为迁移兜底，但新配置应使用模块化 JSON vars。

## Cron 健康检查

`wrangler.toml` 包含：

```toml
[triggers]
crons = ["*/30 * * * *"]
```

定时任务会使用默认配置执行 `health-check`。行为如下：

- 未配置默认 `healthCheck.containers` 或兜底容器时跳过
- 配置错误只记录日志，不抛出未捕获异常
- 仅在 panel 或 container 不健康时发送 Feishu card 通知

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

## 注意事项

- Worker 运行时不能读取本地 `container.json` 或 `docker_registry.json` 文件。请把这些值放进请求体，或存入 Worker secrets。
- 1Panel auth token 由 Worker 代码按 `md5("1panel" + apiKey + timestamp)` 生成。
- 通知使用专门的 card message model，并调用 `feishu_bot_gateway` 的 `/send_card`。
- `templateId` 应由配置管理，不应硬编码在请求体中。
