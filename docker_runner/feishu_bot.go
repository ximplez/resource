package main

type FeishuMsg struct {
	App       string `json:"app"`
	Title     string `json:"title"`
	Msg       string `json:"msg"`
	TargetUrl string `json:"targetUrl"`
}

func NewFeishuMsg(app, title, msg, targetUrl string) *FeishuMsg {
	return &FeishuMsg{
		App:       app,
		Title:     title,
		Msg:       msg,
		TargetUrl: targetUrl,
	}
}

func RedText(text string) string {
	return "<font color=\"red\">" + text + "</font>"
}

func GreenText(text string) string {
	return "<font color=\"green\">" + text + "</font>"
}

func BlueText(text string) string {
	return "<font color=\"blue\">" + text + "</font>"
}

func PurpleText(text string) string {
	return "<font color=\"purple\">" + text + "</font>"
}

func OrangeText(text string) string {
	return "<font color=\"orange\">" + text + "</font>"
}
func BoldText(text string) string {
	return "**" + text + "**"
}

func NotifyFeishu(msg *FeishuMsg) {
	if msg == nil || notifyWebhook == "" {
		return
	}
	// 发送飞书消息
	_, _, err := Post(notifyWebhook, ToJSONString(msg), nil)
	if err != nil {
		logfError("NotifyFeishu err:%v, msg:%s", err, ToJSONString(msg))
		return
	}
}
