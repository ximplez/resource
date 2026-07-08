# onepanel_runner

参照 `docker_runner` 的单包工具结构实现的 1Panel API 执行 runner。

当前支持的动作：

- `upgrade-container`: 升级指定名称的容器

默认参数：

- `-action` 默认值为 `upgrade-container`
- `-api-prefix` 默认值为 `/api/v1`

行为说明：

- 升级前会根据目标镜像自动提取 registry host
- 如果 registry 不是 `docker.io`，会先检查 1Panel 是否已有对应镜像仓库配置
- 命中已有仓库后，会先主动触发一次仓库状态测试，再根据最新状态决定是否继续
- 如果仓库状态不是 `Success`，会尝试从本地 `docker_registry.json` 加载凭据并更新 1Panel 仓库配置，然后重新测试并回查状态
- 如果 1Panel 中不存在该仓库，会尝试从本地 `docker_registry.json` 读取同 registry 的凭据并自动创建仓库；新建仓库名称使用配置中的 key
- 只有仓库最终状态为 `Success` 才会继续执行容器升级
- 容器不存在时直接报错
- 指定 `-image` 时，将容器升级到该镜像
- 不指定 `-image` 时，读取当前容器的 `imageName`，并以该镜像重新拉取后升级

示例：

```bash
go run . \
  -base-url http://127.0.0.1:10086 \
  -api-key your-api-key \
  -container-name nginx
```

```bash
go run . \
  -base-url http://127.0.0.1:10086 \
  -api-key your-api-key \
  -container-name nginx \
  -image nginx:1.27.0
```

如果你的 1Panel 暴露的不是 `/api/v1`，可以显式指定 `-api-prefix`，或者直接把 `-base-url` 传成包含 `/api/v1` / `/api/v2` 的完整地址。

如果需要自动同步私有仓库，请在项目目录或上级目录提供 `docker_registry.json`，格式与 `docker_runner` 使用的配置一致，例如：

```json
{
  "Ali-shenzhen": {
    "registry": "registry.cn-shenzhen.aliyuncs.com",
    "username": "your-username",
    "password": "your-password"
  }
}
```

说明：

- 匹配仓库时按 `registry` / `downloadUrl` 判断，不要求远端仓库名称与本地配置 key 一致
- 只有在新建仓库时，才会使用本地配置 key 作为 1Panel 仓库名称
