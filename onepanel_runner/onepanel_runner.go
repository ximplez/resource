package main

import (
	"errors"
	"fmt"
)

func Run(args *CLIArgs) error {
	if args == nil {
		return errors.New("cli args is nil")
	}

	client := NewOnePanelClient(args.OnePanel)
	switch args.Action {
	case "upgrade-container":
		return runUpgradeContainer(client, args.UpgradeContainer)
	default:
		return fmt.Errorf("unsupported action: %s", args.Action)
	}
}

func runUpgradeContainer(client *OnePanelClient, args UpgradeContainerArgs) error {
	container, err := client.FindContainerByName(args.Name)
	if err != nil {
		return err
	}
	if container == nil {
		return fmt.Errorf("container not found: %s", args.Name)
	}

	targetImage := args.Image
	if isStrEmpty(targetImage) {
		targetImage = container.ImageName
	}
	if isStrEmpty(targetImage) {
		return fmt.Errorf("container current image is empty: %s", args.Name)
	}
	if err := ensureImageRepoForImage(client, targetImage); err != nil {
		return err
	}

	logfInfo("[upgrade-container] container=%s currentImage=%s targetImage=%s forcePull=%v",
		container.Name, container.ImageName, targetImage, args.ForcePull)

	if err := client.UpgradeContainer(container.Name, targetImage, args.ForcePull); err != nil {
		return err
	}

	logfInfo("[upgrade-container] success. container=%s targetImage=%s", container.Name, targetImage)
	return nil
}
