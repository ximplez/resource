package main

import (
	"errors"
	"fmt"
	"os"
)

const REGISTRY_CONFIG_NAME = "docker_registry.json"
const DOCKER_CONFIG_KEY = "dockerConfig"
const NOTIFY_WEBHOOK_KEY = "notify_webhook"

var notifyWebhook = ""

type DockerSecret struct {
	Registry string `json:"registry"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type DockerConfig struct {
	Secret map[string]DockerSecret `json:"secret"`
}

var DockerConfigInstance = &DockerConfig{
	Secret: make(map[string]DockerSecret),
}

type DockerRunConfig struct {
	RegistryName string            `json:"registryName,omitempty"`
	Name         string            `json:"name,omitempty"`
	Image        string            `json:"image,omitempty"`
	Version      string            `json:"version,omitempty"`
	Port         map[string]string `json:"port,omitempty"`
	Env          map[string]string `json:"env,omitempty"`
	Mount        map[string]string `json:"mount,omitempty"`
	Args         string            `json:"args,omitempty"`
	NetworkName  string            `json:"networkName,omitempty"`
}

func (c DockerRunConfig) buildImageFullName() string {
	ds := DockerConfigInstance.Secret[c.RegistryName]
	return fmt.Sprintf("%s/%s:%s", ds.Registry, c.Image, c.Version)
}

func init() {
	logfInfo("[initConfig] start.")
	if e, err := PathExists(REGISTRY_CONFIG_NAME); err != nil || !e {
		msg := fmt.Sprintf("[ERROR] DockerConfig not found. REGISTRY_CONFIG_NAME=%s\n", REGISTRY_CONFIG_NAME)
		if err != nil {
			msg = msg + err.Error()
		}
		panic(errors.New(msg))
	}

	conf, err := os.ReadFile(REGISTRY_CONFIG_NAME)
	if err != nil {
		msg := fmt.Sprintf("[ERROR] DockerConfig read error. REGISTRY_CONFIG_NAME=%s\n", REGISTRY_CONFIG_NAME)
		panic(errors.New(msg + err.Error()))
	}
	parseConfig(conf)
	logfInfo("[initConfig] success.")
}

func parseConfig(conf []byte) {
	var sec = make(map[string]DockerSecret)
	ParseJSONFromString(string(conf), &sec)
	if sec == nil || len(sec) < 1 {
		logfError("[initConfig] config ParseJSONFromString is empty. conf=%s", string(conf))
		panic(errors.New("[ERROR] config ParseJSONFromString is empty"))
	}
	DockerConfigInstance.Secret = sec
}

func ReadDockerRunConfigFromFile(path string) (*DockerRunConfig, error) {
	if e, err := PathExists(path); err != nil || !e {
		msg := fmt.Sprintf("[ERROR] DockerRunConfig not found. path=%s\n", path)
		if err != nil {
			msg = msg + err.Error()
		}
		panic(errors.New(msg))
	}
	conf, err := os.ReadFile(path)
	if err != nil {
		msg := fmt.Sprintf("[ERROR] DockerRunConfig read error. path=%s\n", path)
		panic(errors.New(msg + err.Error()))
	}

	var cfg = make(map[string]any)
	ParseJSONFromString(string(conf), &cfg)
	if dc, ok := cfg[DOCKER_CONFIG_KEY]; !ok || dc == nil {
		msg := fmt.Sprintf("[ERROR] DockerRunConfig is empty. conf=%s\n", string(conf))
		panic(errors.New(msg + err.Error()))
	}
	if nw, ok := cfg[NOTIFY_WEBHOOK_KEY]; ok && nw != nil {
		notifyWebhook = ToJSONString(nw)
	}
	var runCfg = new(DockerRunConfig)
	ParseJSONFromString(ToJSONString(cfg[DOCKER_CONFIG_KEY]), &runCfg)
	return runCfg, nil
}
