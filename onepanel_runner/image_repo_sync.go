package main

import (
	"fmt"
	"strings"
)

func ensureImageRepoForImage(client *OnePanelClient, image string) error {
	registryHost := extractRegistryHost(image)
	if registryHost == "" || registryHost == "docker.io" {
		return nil
	}

	localCfg, err := LoadDockerRegistryConfig()
	if err != nil {
		return err
	}

	repos, err := client.SearchImageRepos()
	if err != nil {
		return err
	}

	for _, repo := range repos {
		if normalizeRegistryHost(repo.DownloadURL) != registryHost {
			continue
		}
		logfInfo("[repo-sync] found repo. registry=%s repo=%s auth=%v status=%s", registryHost, repo.Name, repo.Auth, repo.Status)
		return ensureExistingImageRepoReady(client, repo, registryHost, localCfg)
	}

	if localCfg == nil {
		return fmt.Errorf("image repo %s not found in 1panel, and local %s is missing", registryHost, RegistryConfigName)
	}

	entry := localCfg.FindEntryByRegistryHost(registryHost)
	if entry == nil {
		return fmt.Errorf("image repo %s not found in 1panel, and no matching registry found in local %s", registryHost, RegistryConfigName)
	}

	req := ImageRepoCreateRequest{
		Name:        entry.Key,
		DownloadURL: normalizeRegistryHost(entry.Secret.Registry),
		Protocol:    "https",
		Username:    entry.Secret.Username,
		Password:    entry.Secret.Password,
		Auth:        !isStrEmpty(entry.Secret.Username) || !isStrEmpty(entry.Secret.Password),
	}
	logfInfo("[repo-sync] create repo. registry=%s repo=%s auth=%v", registryHost, req.Name, req.Auth)
	if err := client.CreateImageRepo(req); err != nil {
		return err
	}

	repos, err = client.SearchImageRepos()
	if err != nil {
		return err
	}
	for _, repo := range repos {
		if normalizeRegistryHost(repo.DownloadURL) != registryHost {
			continue
		}
		return ensureExistingImageRepoReady(client, repo, registryHost, localCfg)
	}

	return fmt.Errorf("image repo %s created but not found in follow-up search", registryHost)
}

func ensureExistingImageRepoReady(client *OnePanelClient, repo ImageRepo, registryHost string, localCfg *DockerRegistryConfig) error {
	logfInfo("[repo-sync] trigger repo test. registry=%s repo=%s currentStatus=%s", registryHost, repo.Name, repo.Status)
	if err := client.CheckImageRepoStatus(repo.ID); err != nil {
		return err
	}

	refreshedRepo, err := reloadImageRepo(client, repo.ID)
	if err != nil {
		return err
	}
	if strings.EqualFold(strings.TrimSpace(refreshedRepo.Status), "Success") {
		return nil
	}

	logfInfo("[repo-sync] repo is not ready after test, try refresh config. registry=%s repo=%s status=%s message=%s",
		registryHost, refreshedRepo.Name, refreshedRepo.Status, strings.TrimSpace(refreshedRepo.Message))

	if localCfg == nil {
		return validateImageRepo(refreshedRepo, registryHost)
	}
	entry := localCfg.FindEntryByRegistryHost(registryHost)
	if entry == nil {
		return validateImageRepo(refreshedRepo, registryHost)
	}

	updateReq := ImageRepoUpdateRequest{
		ID:          refreshedRepo.ID,
		DownloadURL: normalizeRegistryHost(entry.Secret.Registry),
		Protocol:    pickProtocol(refreshedRepo.Protocol),
		Username:    entry.Secret.Username,
		Password:    entry.Secret.Password,
		Auth:        !isStrEmpty(entry.Secret.Username) || !isStrEmpty(entry.Secret.Password),
	}
	logfInfo("[repo-sync] update repo from local config. registry=%s repo=%s auth=%v", registryHost, refreshedRepo.Name, updateReq.Auth)
	if err := client.UpdateImageRepo(updateReq); err != nil {
		return err
	}
	if err := client.CheckImageRepoStatus(refreshedRepo.ID); err != nil {
		return err
	}

	updatedRepo, err := reloadImageRepo(client, refreshedRepo.ID)
	if err != nil {
		return err
	}
	return validateImageRepo(updatedRepo, registryHost)
}

func validateImageRepo(repo ImageRepo, registryHost string) error {
	if strings.EqualFold(strings.TrimSpace(repo.Status), "Success") {
		return nil
	}
	return fmt.Errorf("image repo is not ready. registry=%s repo=%s status=%s message=%s",
		registryHost, repo.Name, repo.Status, strings.TrimSpace(repo.Message))
}

func extractRegistryHost(image string) string {
	image = strings.TrimSpace(image)
	if image == "" {
		return ""
	}
	parts := strings.Split(image, "/")
	if len(parts) < 2 {
		return "docker.io"
	}
	first := parts[0]
	if strings.Contains(first, ".") || strings.Contains(first, ":") || first == "localhost" {
		return normalizeRegistryHost(first)
	}
	return "docker.io"
}

func pickProtocol(protocol string) string {
	protocol = strings.TrimSpace(protocol)
	if protocol == "" {
		return "https"
	}
	return protocol
}

func reloadImageRepo(client *OnePanelClient, repoID int) (ImageRepo, error) {
	repos, err := client.SearchImageRepos()
	if err != nil {
		return ImageRepo{}, err
	}
	for _, item := range repos {
		if item.ID == repoID {
			return item, nil
		}
	}
	return ImageRepo{}, fmt.Errorf("image repo id=%d not found in follow-up search", repoID)
}
