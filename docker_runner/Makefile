all: build-linux-amd64 build-linux-arm64

build-linux-amd64:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o ../exe/docker_runner/docker_runner_linux_amd64 main.go

build-linux-arm64:
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o ../exe/docker_runner/docker_runner_linux_arm64 main.go

gox-linux:
	CGO_ENABLED=0 gox -osarch="linux/amd64 linux/arm64" -output="../exe/docker_runner/docker_runner_{{.OS}}_{{.Arch}}"

gox-all:
	CGO_ENABLED=0 gox -osarch="darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64" -output="../exe/docker_runner/docker_runner_{{.OS}}_{{.Arch}}"