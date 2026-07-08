package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const RegistryConfigName = "docker_registry.json"

type DockerRegistrySecret struct {
	Registry string `json:"registry"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type DockerRegistryConfig struct {
	Secret map[string]DockerRegistrySecret `json:"secret"`
}

type DockerRegistryEntry struct {
	Key    string
	Secret DockerRegistrySecret
}

func LoadDockerRegistryConfig() (*DockerRegistryConfig, error) {
	path, err := resolveDockerRegistryConfigPath()
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read docker registry config failed: %w", err)
	}

	var secrets map[string]DockerRegistrySecret
	if err := json.Unmarshal(data, &secrets); err != nil {
		return nil, fmt.Errorf("parse docker registry config failed: %w", err)
	}
	if len(secrets) == 0 {
		return nil, nil
	}

	return &DockerRegistryConfig{Secret: secrets}, nil
}

func resolveDockerRegistryConfigPath() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}

	candidates := []string{
		filepath.Join(wd, RegistryConfigName),
		filepath.Join(filepath.Dir(wd), RegistryConfigName),
		filepath.Join(filepath.Dir(filepath.Dir(wd)), RegistryConfigName),
	}
	for _, candidate := range candidates {
		exists, err := PathExists(candidate)
		if err != nil {
			return "", err
		}
		if exists {
			return candidate, nil
		}
	}
	return "", nil
}

func (c *DockerRegistryConfig) FindByRegistryHost(host string) *DockerRegistrySecret {
	if c == nil || len(c.Secret) == 0 || isStrEmpty(host) {
		return nil
	}
	host = normalizeRegistryHost(host)
	for _, secret := range c.Secret {
		if normalizeRegistryHost(secret.Registry) == host {
			sec := secret
			return &sec
		}
	}
	return nil
}

func (c *DockerRegistryConfig) FindEntryByRegistryHost(host string) *DockerRegistryEntry {
	if c == nil || len(c.Secret) == 0 || isStrEmpty(host) {
		return nil
	}
	host = normalizeRegistryHost(host)
	for key, secret := range c.Secret {
		if normalizeRegistryHost(secret.Registry) == host {
			return &DockerRegistryEntry{
				Key:    key,
				Secret: secret,
			}
		}
	}
	return nil
}

func normalizeRegistryHost(host string) string {
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "https://")
	host = strings.TrimPrefix(host, "http://")
	host = strings.TrimRight(host, "/")
	return host
}
