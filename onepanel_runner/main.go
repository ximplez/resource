package main

func main() {
	args, err := ParseCLIArgs()
	if err != nil {
		logfError("[RUN] parse args failed. err=%s", err.Error())
		panic("RUN error." + err.Error())
	}

	logfInfo("[RUN] start. action=%s baseURL=%s", args.Action, args.OnePanel.BaseURL)
	if err := Run(args); err != nil {
		logfError("[RUN] error. err=%s", err.Error())
		panic("RUN error." + err.Error())
	}
	logfInfo("[RUN] end.")
}
