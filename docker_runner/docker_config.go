package main

import (
	"errors"
	"fmt"
	"os"
)

const CONFIG_NAME = "docker_config.json"

type RegistryName string

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
}

func (c DockerRunConfig) buildImageFullName() string {
	ds := DockerConfigInstance.Secret[c.RegistryName]
	return fmt.Sprintf("%s/%s:%s", ds.Registry, c.Image, c.Version)
}

func init() {
	logfInfo("[initConfig] start.")
	if e, err := PathExists(CONFIG_NAME); err != nil || !e {
		msg := fmt.Sprintf("[ERROR] DockerConfig not found. CONFIG_NAME=%s\n", CONFIG_NAME)
		if err != nil {
			msg = msg + err.Error()
		}
		panic(errors.New(msg))
	}

	conf, err := os.ReadFile(CONFIG_NAME)
	if err != nil {
		msg := fmt.Sprintf("[ERROR] DockerConfig read error. CONFIG_NAME=%s\n", CONFIG_NAME)
		panic(errors.New(msg + err.Error()))
	}
	parseConfig(conf)
	logfInfo("[initConfig] success.")
}

func parseConfig(conf []byte) {
	type DockerSecretJson struct {
		RegistryName string `json:"registryName"`
		DockerSecret
	}
	var sec = make([]DockerSecretJson, 0)
	ParseJSONFromString(string(conf), &sec)
	if sec == nil || len(sec) < 1 {
		logfError("[initConfig] config ParseJSONFromString is empty. conf=%s", string(conf))
		panic(errors.New("[ERROR] config ParseJSONFromString is empty"))
	}
	for _, s := range sec {
		DockerConfigInstance.Secret[s.RegistryName] = DockerSecret{
			Registry: s.Registry,
			Username: s.Username,
			Password: s.Password,
		}
	}
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

	var cfg = new(DockerRunConfig)
	ParseJSONFromString(string(conf), &cfg)
	return cfg, nil
}
