package main

import (
	"errors"
	"flag"
	"fmt"
	"strings"
)

var (
	runCfg *DockerRunConfig
)

func main() {
	// docker run 执行配置文件路径
	var dockerRunConfigPath string
	// StringVar用指定的名称、控制台参数项目、默认值、使用信息注册一个string类型flag，并将flag的值保存到p指向的变量
	flag.StringVar(&dockerRunConfigPath, "c", "", "docker run 执行配置文件路径")
	// 从arguments中解析注册的flag。必须在所有flag都注册好而未访问其值时执行。未注册却使用flag -help时，会返回ErrHelp。
	flag.Parse()
	logfInfo("[RUN] dockerRunConfigPath=%s", dockerRunConfigPath)

	if err := run(strings.TrimSpace(dockerRunConfigPath)); err != nil {
		NotifyFeishu(NewFeishuMsg("🔧 DockerRunner", "❌ Run Failed", err.Error(), ""))
		logfError("[RUN] error. err=%s", err.Error())
		panic("RUN error." + err.Error())
	}
	NotifyFeishu(NewFeishuMsg("🔧 DockerRunner", "✅ Run Success", "", ""))
	logfInfo("[RUN] end.")
}

func run(path string) (err error) {
	logfInfo("[RUN] start.")
	if len(path) < 1 {
		return errors.New("dockerRunConfigPath is empty")
	}
	runCfg, err = ReadDockerRunConfigFromFile(path)
	if err != nil {
		return err
	}
	if !checkRunConfig(runCfg) {
		logfError("[RUN] checkRunConfig fail. runCfg: %s", ToJSONString(runCfg))
		return errors.New("ReadDockerRunConfigFromFile is nil")
	}
	// logfInfo("[RUN] DockerRunConfig: %s", ToJSONString(runCfg))
	NotifyFeishu(NewFeishuMsg("🔧 DockerRunner", fmt.Sprintf("✅ Run Start【%s】", runCfg.buildImageFullName()), ToJSONString(runCfg), ""))
	if err := LoginDocker(runCfg.RegistryName); err != nil {
		return err
	}
	if err := ContainerStopAndRemove(runCfg.Name); err != nil {
		return err
	}
	if err := ImagePull(runCfg); err != nil {
		return err
	}
	if err := ContainerStart(runCfg); err != nil {
		return err
	}
	return nil
}

func checkRunConfig(cfg *DockerRunConfig) bool {
	return cfg != nil &&
		!isStrEmpty(&cfg.RegistryName) &&
		!isStrEmpty(&cfg.Name) &&
		!isStrEmpty(&cfg.Version) &&
		!isStrEmpty(&cfg.Image)
}
