package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"github.com/docker/go-connections/nat"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/registry"
	docker_client "github.com/docker/docker/client"
)

var cl *docker_client.Client

func init() {
	c, err := docker_client.NewClientWithOpts()
	if err != nil {
		logfError("[initClient] Unable to create docker client")
		panic(err)
	}
	cl = c
}

// 登录docker
func LoginDocker(name string) error {
	login, err := cl.RegistryLogin(context.Background(), getAuthConfig(name))
	if err != nil {
		return err
	}
	logfInfo("[LoginDocker] login success, name=%s, Status=%s", name, login.Status)
	return nil
}

// ======================  镜像操作 ======================
// 列出镜像
func ImageList() ([]image.Summary, error) {
	return cl.ImageList(context.Background(), types.ImageListOptions{})
}

func ImagePull(cfg *DockerRunConfig) error {
	pullReader, err := cl.ImagePull(context.Background(), cfg.buildImageFullName(), types.ImagePullOptions{
		RegistryAuth: getAuthStr(cfg.RegistryName),
	})
	if err != nil {
		return err
	}
	defer pullReader.Close()
	buf := new(bytes.Buffer)
	buf.ReadFrom(pullReader)
	s := buf.String()
	logfInfo("info: %s", s)
	logfInfo("image pull end")
	return err
}

// ======================  容器操作 ======================
// 列出容器
func ContainerList() ([]types.Container, error) {
	return cl.ContainerList(context.Background(), container.ListOptions{})
}

// 停止容器
func ContainerStop(name string) error {
	ct, err := findContainerByName(name)
	if err != nil {
		return err
	}
	if ct == nil {
		logfInfo("[ContainerStop] container is nil. name=%s", name)
		return nil
	}
	logfInfo("[ContainerStop] find container by name. container=%s", ToJSONString(ct))
	return cl.ContainerStop(context.Background(), ct.ID, container.StopOptions{})
}

// 删除容器
func ContainerRemove(name string) error {
	ct, err := findContainerByName(name)
	if err != nil {
		return err
	}
	if ct == nil {
		logfInfo("[ContainerRemove] container is nil. name=%s", name)
		return nil
	}
	logfInfo("[ContainerRemove] find container by name. container=%s", ToJSONString(ct))
	return cl.ContainerRemove(context.Background(), ct.ID, container.RemoveOptions{})
}

// 启动容器
func ContainerStart(cfg *DockerRunConfig) error {
	logfInfo("[ContainerStart] start. cfg=%s", ToJSONString(cfg))
	config := container.Config{
		Image: cfg.buildImageFullName(),
		Env:   []string{"MYSQL_ROOT_PASSWORD", "123456"},
	}
	hostConfig := container.HostConfig{
		PortBindings: make(nat.PortMap),
		Mounts:       make([]mount.Mount, 0),
	}
	if len(cfg.Port) > 0 {
		for p1, p2 := range cfg.Port {
			hostConfig.PortBindings[nat.Port(p2)] = []nat.PortBinding{
				{
					HostIP:   "0.0.0.0",
					HostPort: cfg.Port[p1],
				},
			}
		}
	}
	if len(cfg.Mount) > 0 {
		for m1, m2 := range cfg.Mount {
			hostConfig.Mounts = append(hostConfig.Mounts, mount.Mount{
				Type:   mount.TypeBind,
				Source: m1,
				Target: m2,
			})
		}
	}
	create, err := cl.ContainerCreate(context.Background(),
		&config,
		&hostConfig,
		nil,
		nil,
		cfg.Name)
	if err != nil {
		return err
	}

	if err := cl.ContainerStart(context.Background(), create.ID, container.StartOptions{}); err != nil {
		return err
	}
	stats, err := cl.ContainerStats(context.Background(), create.ID, false)
	logfInfo("[ContainerStart] success. stats=%s", ToJSONString(stats))
	return nil
}

func findContainerByName(name string) (*types.Container, error) {
	list, err := ContainerList()
	if err != nil {
		return nil, err
	}
	if len(list) < 1 {
		return nil, nil
	}
	for i, c := range list {
		if len(c.Names) < 1 {
			continue
		}
		for _, n := range c.Names {
			if n == "/"+name {
				return &list[i], nil
			}
		}
	}
	return nil, nil
}

func getAuthConfig(registryName string) (authConfig registry.AuthConfig) {
	secret, ok := DockerConfigInstance.Secret[registryName]
	if !ok {
		logfError("loginDocker no config by RegistryName=%s", registryName)
	}
	return registry.AuthConfig{
		ServerAddress: secret.Registry,
		Username:      secret.Username,
		Password:      secret.Password,
	}
}

func getAuthStr(registryName string) string {
	encodedJSON := ToJSONString(getAuthConfig(registryName))
	return base64.URLEncoding.EncodeToString([]byte(encodedJSON))
}
