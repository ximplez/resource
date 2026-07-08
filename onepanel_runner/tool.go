package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

func logfInfo(format string, msg ...any) {
	fmt.Printf("%s [INFO] %s\n", NowPretty(), fmt.Sprintf(format, msg...))
}

func logfError(format string, msg ...any) {
	fmt.Printf("%s [ERROR] %s\n", NowPretty(), fmt.Sprintf(format, msg...))
}

func NowPretty() string {
	return time.Now().Format("2006-01-02 15:04:05.000")
}

func ToJSONString(obj any) string {
	str, _ := json.Marshal(obj)
	return string(str)
}

func ParseJSONFromString(data string, obj any) {
	_ = json.Unmarshal([]byte(data), obj)
}

func isStrEmpty(s string) bool {
	return len(strings.TrimSpace(s)) < 1
}

func PathExists(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}
