package main

import (
	"github.com/ProtonMail/go-crypto/openpgp"
	"github.com/ProtonMail/go-crypto/openpgp/packet"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/transport/ssh"
	"log"
	"os"
)

func main() {
	act, url, directory, privateKeyFile := os.Args[1], os.Args[2], os.Args[3], os.Args[4]
	var password string
	if len(os.Args) == 6 {
		password = os.Args[5]
	}
	_, err := os.Stat(privateKeyFile)
	if err != nil {
		log.Fatalf("read file %s failed %s", privateKeyFile, err.Error())
		return
	}

	privateKey, err := ssh.NewPublicKeysFromFile("git", privateKeyFile, password)
	if err != nil {
		log.Fatalf("generate privateKey failed: %s", err.Error())
		return
	}

	switch act {
	case "init":
		gitInit(directory)
	case "clone":
		gitClone(url, directory, privateKey)
	case "commit&push":
		gitCommitAndPush(url, directory, "", privateKey)
	}
}

func gitInit(directory string) {
	log.Printf("git init %s ", directory)
	if !isDir(directory) {
		log.Fatalf("directory is not a directory")
		return
	}
	repository, err := git.PlainInitWithOptions(directory, &git.PlainInitOptions{
		InitOptions: git.InitOptions{
			DefaultBranch: plumbing.Main,
		},
	})
	if err != nil {
		log.Fatalf("init failed: %s", err.Error())
		return
	}
	ref, err := repository.Head()
	if err != nil {
		log.Fatalf("get head failed: %s", err.Error())
		return
	}
	log.Printf("git init %s success", ref.String())
	return
}

func gitClone(url, directory string, privateKey *ssh.PublicKeys) {
	// Clone the given repository to the given directory
	log.Printf("git clone %s => %s", url, directory)
	r, err := git.PlainClone(directory, false, &git.CloneOptions{
		Auth:     privateKey,
		URL:      url,
		Progress: os.Stdout,
	})
	if err != nil {
		log.Fatalf("clone failed: %s", err.Error())
		return
	}

	// ... retrieving the branch being pointed by HEAD
	ref, err := r.Head()
	if err != nil {
		log.Fatalf("get head failed: %s", err.Error())
		return
	}
	// ... retrieving the commit object
	commit, err := r.CommitObject(ref.Hash())
	if err != nil {
		log.Fatalf("get commit failed: %s", err.Error())
		return
	}

	log.Printf("git clone %s success %s", url, commit)
	return
}

func gitCommitAndPush(url, directory, commitMsg string, privateKey *ssh.PublicKeys) {
	log.Printf("git commitAndPush %s, commitMsg=%s", url, commitMsg)
	r, err := git.PlainOpenWithOptions(directory, &git.PlainOpenOptions{
		DetectDotGit: true,
	})
	if err != nil {
		log.Fatalf("open repository failed: %s", err.Error())
		return
	}
	r_cfg, err := r.ConfigScoped(config.SystemScope)
	if err != nil {
		log.Fatalf("get repostory config failed: %s", err.Error())
		return
	}

	// ... retrieving the branch being pointed by HEAD
	wt, err := r.Worktree()
	if err != nil {
		log.Fatalf("get worktree failed: %s", err.Error())
		return
	}
	if commitMsg == "" {
		commitMsg = "auto commit"
	}
	_, err = wt.Add(".")
	if err != nil {
		log.Fatalf("git add file failed: %s", err.Error())
		return
	}
	status, err := wt.Status()
	if err != nil {
		log.Fatalf("get worktree status failed: %s", err.Error())
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
		log.Fatalf("generate entity failed: %s", err.Error())
		return
	}
	commit, err := wt.Commit(commitMsg, &git.CommitOptions{
		SignKey: entity,
	})
	if err != nil {
		log.Fatalf("git commit failed: %s", err.Error())
		return
	}
	log.Printf("git commit success %s", commit)
	err = r.Push(&git.PushOptions{
		Auth:     privateKey,
		Progress: os.Stdout,
	})
	if err != nil {
		log.Fatalf("git push failed: %s", err.Error())
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
