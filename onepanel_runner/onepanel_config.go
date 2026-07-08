package main

import (
	"errors"
	"flag"
	"strings"
)

type OnePanelConfig struct {
	BaseURL   string
	APIKey    string
	APIPrefix string
}

type UpgradeContainerArgs struct {
	Name      string
	Image     string
	ForcePull bool
}

type CLIArgs struct {
	Action           string
	OnePanel         OnePanelConfig
	UpgradeContainer UpgradeContainerArgs
}

func ParseCLIArgs() (*CLIArgs, error) {
	var args CLIArgs

	flag.StringVar(&args.Action, "action", "upgrade-container", "要执行的功能，例如 upgrade-container")
	flag.StringVar(&args.OnePanel.BaseURL, "base-url", "", "1Panel 地址，例如 http://127.0.0.1:10086")
	flag.StringVar(&args.OnePanel.APIPrefix, "api-prefix", "/api/v1", "1Panel API 前缀，例如 /api/v1 或 /api/v2")
	flag.StringVar(&args.OnePanel.APIKey, "api-key", "", "1Panel API Key")
	flag.StringVar(&args.UpgradeContainer.Name, "container-name", "", "要升级的容器名称")
	flag.StringVar(&args.UpgradeContainer.Image, "image", "", "目标镜像，留空则重新拉取当前容器镜像")
	flag.BoolVar(&args.UpgradeContainer.ForcePull, "force-pull", true, "升级时是否强制拉取镜像")
	flag.Parse()

	args.Action = strings.TrimSpace(args.Action)
	args.OnePanel.BaseURL = normalizeBaseURL(args.OnePanel.BaseURL, args.OnePanel.APIPrefix)
	args.OnePanel.APIKey = strings.TrimSpace(args.OnePanel.APIKey)
	args.UpgradeContainer.Name = strings.TrimSpace(args.UpgradeContainer.Name)
	args.UpgradeContainer.Image = strings.TrimSpace(args.UpgradeContainer.Image)

	if isStrEmpty(args.OnePanel.BaseURL) {
		return nil, errors.New("base-url is required")
	}
	if isStrEmpty(args.OnePanel.APIKey) {
		return nil, errors.New("api-key is required")
	}

	switch args.Action {
	case "upgrade-container":
		if isStrEmpty(args.UpgradeContainer.Name) {
			return nil, errors.New("container-name is required when action=upgrade-container")
		}
	default:
		return nil, errors.New("unsupported action: " + args.Action)
	}

	return &args, nil
}

func normalizeBaseURL(baseURL, apiPrefix string) string {
	baseURL = strings.TrimSpace(baseURL)
	apiPrefix = "/" + strings.Trim(strings.TrimSpace(apiPrefix), "/")
	baseURL = strings.TrimRight(baseURL, "/")
	if strings.HasSuffix(baseURL, "/api/v1") || strings.HasSuffix(baseURL, "/api/v2") {
		return baseURL
	}
	return baseURL + apiPrefix
}
