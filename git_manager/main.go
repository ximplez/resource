package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/ProtonMail/go-crypto/openpgp"
	"github.com/ProtonMail/go-crypto/openpgp/packet"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/transport/ssh"
)

var (
	handle         string
	url            string
	directory      string
	privateKeyFile string
	password       string
	alarmUrl       string
	detailUrl      string
)

func initVar() {
	h := flag.String("h", "", "handle 方式")
	u := flag.String("u", "", "url")
	d := flag.String("d", "", "directory")
	pk := flag.String("p", "", "privateKeyFile")
	pwd := flag.String("w", "", "password")
	au := flag.String("au", "", "alarmUrl")
	du := flag.String("du", "", "detailUrl")
	flag.Parse()
	handle = *h
	url = *u
	directory = *d
	password = *pwd
	privateKeyFile = *pk
	alarmUrl = *au
	detailUrl = *du
}

func main() {
	initVar()
	_, err := os.Stat(privateKeyFile)
	if err != nil {
		handleError("read file %s failed %s", privateKeyFile, err.Error())
		return
	}

	privateKey, err := ssh.NewPublicKeysFromFile("git", privateKeyFile, password)
	if err != nil {
		handleError("generate privateKey failed: %s", err.Error())
		return
	}

	switch handle {
	case "init":
		gitInit()
	case "clone":
		gitClone(privateKey)
	case "pull":
		gitPull(privateKey)
	case "commit&push":
		gitCommitAndPush(privateKey)
	}
}

func gitInit() {
	log.Printf("git init %s ", directory)
	if !isDir(directory) {
		handleError("%s is not a directory", directory)
		return
	}
	repository, err := git.PlainInitWithOptions(directory, &git.PlainInitOptions{
		InitOptions: git.InitOptions{
			DefaultBranch: plumbing.Main,
		},
	})
	if err != nil {
		handleError("init failed: %s", err.Error())
		return
	}
	ref, err := repository.Head()
	if err != nil {
		handleError("get head failed: %s", err.Error())
		return
	}
	log.Printf("git init %s success", ref.String())
	return
}

func gitClone(privateKey *ssh.PublicKeys) {
	// Clone the given repository to the given directory
	log.Printf("git clone %s => %s", url, directory)
	r, err := git.PlainClone(directory, false, &git.CloneOptions{
		Auth:     privateKey,
		URL:      url,
		Progress: os.Stdout,
	})
	if err != nil {
		handleError("clone failed: %s", err.Error())
		return
	}

	// ... retrieving the branch being pointed by HEAD
	ref, err := r.Head()
	if err != nil {
		handleError("get head failed: %s", err.Error())
		return
	}
	// ... retrieving the commit object
	commit, err := r.CommitObject(ref.Hash())
	if err != nil {
		handleError("get commit failed: %s", err.Error())
		return
	}

	log.Printf("git clone %s success %s", url, commit)
	return
}

func gitPull(privateKey *ssh.PublicKeys) {
	log.Printf("git pull %s", url)
	r, err := git.PlainOpenWithOptions(directory, &git.PlainOpenOptions{
		DetectDotGit: true,
	})
	if err != nil {
		handleError("open repository failed: %s", err.Error())
		return
	}
	worktree, err := r.Worktree()
	if err != nil {
		handleError("get worktree failed: %s", err.Error())
		return
	}
	if worktree == nil {
		handleError("worktree is nil")
		return
	}
	err = worktree.Pull(&git.PullOptions{
		Auth:     privateKey,
		Progress: os.Stdout,
	})
	if err != nil {
		handleError("pull failed: %s", err.Error())
		return
	}
	log.Printf("git pull %s success", url)
	return
}

func gitCommitAndPush(privateKey *ssh.PublicKeys) {
	log.Printf("git commitAndPush %s", url)
	if !isDir(directory) {
		handleError("%s is not a directory", directory)
		return
	}
	r, err := git.PlainOpenWithOptions(directory, &git.PlainOpenOptions{
		DetectDotGit: true,
	})
	if err != nil {
		handleError("open repository failed: %s", err.Error())
		return
	}
	r_cfg, err := r.ConfigScoped(config.SystemScope)
	if err != nil {
		handleError("get repostory config failed: %s", err.Error())
		return
	}

	// ... retrieving the branch being pointed by HEAD
	wt, err := r.Worktree()
	if err != nil {
		handleError("get worktree failed: %s", err.Error())
		return
	}
	_, err = wt.Add(".")
	if err != nil {
		handleError("git add file failed: %s", err.Error())
		return
	}
	status, err := wt.Status()
	if err != nil {
		handleError("get worktree status failed: %s", err.Error())
		return
	}
	if status.IsClean() {
		log.Printf("worktree is clean, no need to commit")
		return
	}

	name, email := getUserNameAndEmailFromCfg(r_cfg)

	log.Printf("worktree is not clean, need to commit")
	entity, err := openpgp.NewEntity(name, "", email, &packet.Config{})
	if err != nil {
		handleError("generate entity failed: %s", err.Error())
		return
	}
	commit, err := wt.Commit("auto commit", &git.CommitOptions{
		SignKey: entity,
	})
	if err != nil {
		handleError("git commit failed: %s", err.Error())
		return
	}
	log.Printf("git commit success %s", commit)
	err = r.Push(&git.PushOptions{
		Auth:     privateKey,
		Progress: os.Stdout,
	})
	if err != nil {
		handleError("git push failed: %s", err.Error())
		return
	}
	log.Printf("git push success %s", commit)
	return
}

func getUserNameAndEmailFromCfg(cfg *config.Config) (string, string) {
	if cfg == nil {
		return "", ""
	}
	if cfg.User.Name != "" && cfg.User.Email != "" {
		return cfg.User.Name, cfg.User.Email
	}
	if cfg.Author.Email != "" && cfg.Author.Name != "" {
		return cfg.Author.Name, cfg.Author.Email
	}
	if cfg.Committer.Email != "" && cfg.Committer.Name != "" {
		return cfg.Committer.Name, cfg.Committer.Email
	}
	return "", ""
}

func isDir(path string) bool {
	s, err := os.Stat(path)
	if err != nil {
		return false
	}
	return s.IsDir()
}

func handleError(format string, v ...any) {
	if alarmUrl != "" {
		_, _, err := Post(alarmUrl, map[string]any{
			"app":    "GitManager",
			"title":  "execute failed",
			"msg":    fmt.Sprintf(format, v),
			"detail": detailUrl,
		}, map[string]string{
			"Content-Type": "application/json",
		})
		if err != nil {
			log.Printf("send alarm failed: %s", err.Error())
		}
	}
	log.Fatalf(format, v)
}
