# onepanel_worker

Cloudflare Worker for request-driven 1Panel automation.

It provides the core actions:

- `upgrade-container`
- `create-container`
- `health-check`

It also keeps the private registry sync behavior:

- detect registry host from the target image
- skip repo sync for `docker.io`
- search existing 1Panel image repo configs
- trigger repo status check before upgrade or create
- update existing repo credentials from config when status is not `Success`
- create a new repo from config when 1Panel does not have that registry yet

## Runtime model

The Worker is request driven:

- local file input becomes JSON request payload or Worker secrets
- CLI flags become HTTP fields
- periodic health checks use a Worker cron trigger

## Source layout

The Worker implementation is split by responsibility:

- `src/index.js`: Worker entry and route dispatch
- `src/actions/`: action handlers
- `src/config/`: request/env/default normalization
- `src/onepanel/`: 1Panel auth, client, and registry sync
- `src/notifications/`: Feishu card message model and gateway notifications
- `src/lib/`: shared HTTP and object helpers

## Endpoints

### `GET /health`

Worker health check.

### `POST /run`

Generic action entrypoint. Body must contain `action`.

Supported actions:

- `upgrade-container`
- `create-container`
- `health-check`

### `POST /upgrade-container`

Upgrade a container.

Request example:

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

Optional fields:

- `createIfMissing`: when `true`, create the container if it does not exist
- `containerConfig`: create config used when `createIfMissing=true`
- `onepanel`: optional per-request override for `baseUrl`, `apiKey`, `apiPrefix`
- `dockerRegistryConfig`: optional per-request registry credential map
- `notification`: optional per-request Feishu card notification override

### `POST /create-container`

Create and start a container.

Request example:

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

The Worker accepts either:

- `containerConfig`
- `dockerConfig`
- or the create config fields directly in the request body

### `POST /health-check`

Check 1Panel reachability and one target container status.

Request example:

```bash
curl -X POST 'http://127.0.0.1:8787/health-check' \
  -H 'Authorization: Bearer your-api-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "containers": ["nginx", "yak"]
  }'
```

Health failures return HTTP `200` with `healthy: false`, which matches the original intent of reporting issues without turning the whole execution into a hard process failure. Invalid auth or invalid input still return `4xx` or `5xx`.

The endpoint accepts either:

- `containers`: preferred list form for checking multiple containers
- `containerNames`: alias list form
- `containerName`: backward-compatible single-container form

By default:

- `health-check` sends a Feishu card only when unhealthy
- `upgrade-container` and `create-container` first send a preview card, then update the same card with the final result

## Configuration

Configure secrets or vars in Cloudflare:

```bash
wrangler secret put API_AUTH_TOKEN
wrangler secret put ONEPANEL_CONFIG_JSON
wrangler secret put NOTIFICATION_CONFIG_JSON
wrangler secret put DOCKER_REGISTRY_CONFIG_JSON
wrangler secret put DEFAULTS_CONFIG_JSON
```

Minimal required runtime config:

- `API_AUTH_TOKEN`
- `ONEPANEL_CONFIG_JSON`

Optional config:

- `NOTIFICATION_CONFIG_JSON`
- `DOCKER_REGISTRY_CONFIG_JSON`
- `DEFAULTS_CONFIG_JSON`

`API_AUTH_TOKEN` intentionally stays as a top-level auth variable. Business config should be grouped by module.

`ONEPANEL_CONFIG_JSON` example:

```json
{
  "baseUrl": "https://your-onepanel.example.com",
  "apiKey": "your-onepanel-api-key",
  "apiPrefix": "/api/v1",
  "defaultContainerName": "yak"
}
```

`NOTIFICATION_CONFIG_JSON` example:

```json
{
  "gatewayBaseUrl": "https://your-feishu-bot-gateway.example.workers.dev",
  "gatewayAuthToken": "your-gateway-token",
  "appId": "cli_xxx",
  "templateId": "AAq2HMaiGq246",
  "templateVersionName": "1.0.0",
  "receiveIdType": "email",
  "receiveId": "name@example.com",
  "appName": "1PanelWorker"
}
```

Feishu notifications are sent through `feishu_bot_gateway` `POST /send_card`, not through the old custom webhook JSON payload.

For `upgrade-container` and `create-container`, `onepanel_worker` uses a two-phase notification flow:

- send a preview template card first
- after the action finishes, update the same Feishu message with the final result using the returned `messageId`

Required notification config for card delivery:

- `NOTIFICATION_CONFIG_JSON.gatewayBaseUrl`
- `NOTIFICATION_CONFIG_JSON.gatewayAuthToken`
- `NOTIFICATION_CONFIG_JSON.appId`
- `NOTIFICATION_CONFIG_JSON.templateId`

Optional gateway config:

- `NOTIFICATION_CONFIG_JSON.templateVersionName`
- `NOTIFICATION_CONFIG_JSON.receiveIdType`
- `NOTIFICATION_CONFIG_JSON.receiveId`
- `NOTIFICATION_CONFIG_JSON.appName`
- `NOTIFICATION_CONFIG_JSON.enabled`

Template variables sent to `feishu_bot_gateway` include:

- `app_name` / `appName`
- `title`
- `status`
- `action`
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

`DOCKER_REGISTRY_CONFIG_JSON` uses this top-level object shape:

```json
{
  "Ali-shenzhen": {
    "registry": "registry.cn-shenzhen.aliyuncs.com",
    "username": "your-username",
    "password": "your-password"
  }
}
```

`DEFAULTS_CONFIG_JSON` can provide per-action defaults:

```json
{
  "healthCheck": {
    "containers": ["nginx", "yak"]
  }
}
```

For local development, `example.env.json` uses the same module names as objects: `onepanel`, `notification`, `dockerRegistry`, and `defaults`. In Cloudflare vars, use the JSON-string variants above.

Legacy flat vars such as `ONEPANEL_BASE_URL`, `FEISHU_BOT_GATEWAY_BASE_URL`, `DOCKER_REGISTRY_JSON`, and `WORKER_DEFAULTS_JSON` are still accepted as migration fallback, but new configuration should use module JSON vars.

## Cron health check

`wrangler.toml` includes:

```toml
[triggers]
crons = ["*/30 * * * *"]
```

The scheduled task runs `health-check` with default configuration. It will:

- skip when no default `healthCheck.containers` or fallback container is configured
- log misconfiguration instead of throwing an uncaught exception
- send a Feishu card notification only when the panel or container is unhealthy

## Local development

Install dependencies:

```bash
npm install
```

Syntax check:

```bash
npm run check
```

Run locally:

```bash
npm run dev
```

## Notes

- The Worker cannot read local `container.json` or `docker_registry.json` files at runtime. Pass those values in the request body or store them in Worker secrets.
- The 1Panel auth token is generated in Worker code with `md5("1panel" + apiKey + timestamp)`.
- Notifications use a dedicated card message model and call `feishu_bot_gateway` `/send_card`.
- `templateId` should be managed in config, not hardcoded in request payloads.
