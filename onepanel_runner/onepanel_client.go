package main

import (
	"crypto/md5"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type OnePanelClient struct {
	baseURL string
	apiKey  string
}

type OnePanelResponse[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type PageResult[T any] struct {
	Items []T   `json:"items"`
	Total int64 `json:"total"`
}

type PageContainerRequest struct {
	Page            int    `json:"page"`
	PageSize        int    `json:"pageSize"`
	Name            string `json:"name"`
	State           string `json:"state"`
	OrderBy         string `json:"orderBy"`
	Order           string `json:"order"`
	Filters         string `json:"filters"`
	ExcludeAppStore bool   `json:"excludeAppStore"`
}

type ContainerInfo struct {
	ContainerID string   `json:"containerID"`
	Name        string   `json:"name"`
	ImageName   string   `json:"imageName"`
	State       string   `json:"state"`
	Network     []string `json:"network"`
	Ports       []string `json:"ports"`
}

type ContainerUpgradeRequest struct {
	Name      string `json:"name"`
	Image     string `json:"image"`
	ForcePull bool   `json:"forcePull"`
}

type ImageRepo struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	DownloadURL string `json:"downloadUrl"`
	Protocol    string `json:"protocol"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	Auth        bool   `json:"auth"`
	Status      string `json:"status"`
	Message     string `json:"message"`
}

type ImageRepoOption struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	DownloadURL string `json:"downloadUrl"`
}

type SearchWithPageRequest struct {
	Info     string `json:"info"`
	Page     int    `json:"page"`
	PageSize int    `json:"pageSize"`
}

type ImageRepoCreateRequest struct {
	Name        string `json:"name"`
	DownloadURL string `json:"downloadUrl"`
	Protocol    string `json:"protocol"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	Auth        bool   `json:"auth"`
}

type ImageRepoUpdateRequest struct {
	ID          int    `json:"id"`
	DownloadURL string `json:"downloadUrl"`
	Protocol    string `json:"protocol"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	Auth        bool   `json:"auth"`
}

type OperateByID struct {
	ID int `json:"id"`
}

func NewOnePanelClient(cfg OnePanelConfig) *OnePanelClient {
	return &OnePanelClient{
		baseURL: cfg.BaseURL,
		apiKey:  cfg.APIKey,
	}
}

func (c *OnePanelClient) FindContainerByName(name string) (*ContainerInfo, error) {
	req := PageContainerRequest{
		Page:            1,
		PageSize:        100,
		Name:            name,
		State:           "all",
		OrderBy:         "name",
		Order:           "ascending",
		Filters:         "",
		ExcludeAppStore: false,
	}
	resp, err := postOnePanel[PageResult[ContainerInfo]](c, "/containers/search", req)
	if err != nil {
		return nil, err
	}
	for i := range resp.Data.Items {
		item := resp.Data.Items[i]
		if strings.TrimSpace(item.Name) == name {
			return &item, nil
		}
	}
	return nil, nil
}

func (c *OnePanelClient) UpgradeContainer(name, image string, forcePull bool) error {
	if isStrEmpty(image) {
		return errors.New("upgrade image is empty")
	}
	_, err := postOnePanel[any](c, "/containers/upgrade", ContainerUpgradeRequest{
		Name:      name,
		Image:     image,
		ForcePull: forcePull,
	})
	return err
}

func (c *OnePanelClient) ListImageRepos() ([]ImageRepoOption, error) {
	resp, err := getOnePanel[[]ImageRepoOption](c, "/containers/repo")
	if err != nil {
		return nil, err
	}
	return resp.Data, nil
}

func (c *OnePanelClient) SearchImageRepos() ([]ImageRepo, error) {
	resp, err := postOnePanel[PageResult[ImageRepo]](c, "/containers/repo/search", SearchWithPageRequest{
		Info:     "",
		Page:     1,
		PageSize: 100,
	})
	if err != nil {
		return nil, err
	}
	return resp.Data.Items, nil
}

func (c *OnePanelClient) CreateImageRepo(req ImageRepoCreateRequest) error {
	_, err := postOnePanel[any](c, "/containers/repo", req)
	return err
}

func (c *OnePanelClient) UpdateImageRepo(req ImageRepoUpdateRequest) error {
	_, err := postOnePanel[any](c, "/containers/repo/update", req)
	return err
}

func (c *OnePanelClient) CheckImageRepoStatus(id int) error {
	_, err := postOnePanel[any](c, "/containers/repo/status", OperateByID{ID: id})
	return err
}

func postOnePanel[T any](c *OnePanelClient, path string, body any) (*OnePanelResponse[T], error) {
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	token := buildOnePanelToken(c.apiKey, timestamp)

	var result OnePanelResponse[T]
	resp, err := client.R().
		SetHeader("Content-Type", "application/json").
		SetHeader("1Panel-Token", token).
		SetHeader("1Panel-Timestamp", timestamp).
		SetBody(body).
		SetResult(&result).
		Post(c.baseURL + path)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode() != http.StatusOK {
		return nil, fmt.Errorf("1panel request failed. status=%d body=%s", resp.StatusCode(), resp.String())
	}
	if result.Code != 200 {
		return nil, fmt.Errorf("1panel api error. code=%d message=%s", result.Code, result.Message)
	}
	return &result, nil
}

func getOnePanel[T any](c *OnePanelClient, path string) (*OnePanelResponse[T], error) {
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	token := buildOnePanelToken(c.apiKey, timestamp)

	var result OnePanelResponse[T]
	resp, err := client.R().
		SetHeader("1Panel-Token", token).
		SetHeader("1Panel-Timestamp", timestamp).
		SetResult(&result).
		Get(c.baseURL + path)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode() != http.StatusOK {
		return nil, fmt.Errorf("1panel request failed. status=%d body=%s", resp.StatusCode(), resp.String())
	}
	if result.Code != 200 {
		return nil, fmt.Errorf("1panel api error. code=%d message=%s", result.Code, result.Message)
	}
	return &result, nil
}

func getOnePanelWithBody[T any](c *OnePanelClient, path string, body any) (*OnePanelResponse[T], error) {
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	token := buildOnePanelToken(c.apiKey, timestamp)

	var result OnePanelResponse[T]
	resp, err := client.R().
		SetHeader("Content-Type", "application/json").
		SetHeader("1Panel-Token", token).
		SetHeader("1Panel-Timestamp", timestamp).
		SetBody(body).
		SetResult(&result).
		Get(c.baseURL + path)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode() != http.StatusOK {
		return nil, fmt.Errorf("1panel request failed. status=%d body=%s", resp.StatusCode(), resp.String())
	}
	if result.Code != 200 {
		return nil, fmt.Errorf("1panel api error. code=%d message=%s", result.Code, result.Message)
	}
	return &result, nil
}

func buildOnePanelToken(apiKey, timestamp string) string {
	sum := md5.Sum([]byte("1panel" + apiKey + timestamp))
	return hex.EncodeToString(sum[:])
}
