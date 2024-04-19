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

func printMsg(msg ...any) string {
	if len(msg) < 1 {
		return ""
	}
	ss := make([]string, 0)
	for _, m := range msg {
		ss = append(ss, ToJSONString(m))
	}
	return strings.Join(ss, " | ")
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

func PathExists(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	//isnotexist来判断，是不是不存在的错误
	if os.IsNotExist(err) {
		//如果返回的错误类型使用os.isNotExist()判断为true，说明文件或者文件夹不存在
		return false, nil
	}
	return false, err //如果有错误了，但是不是不存在的错误，所以把这个错误原封不动的返回
}

// 判断所给路径是否为文件夹
func IsDir(path string) bool {
	s, err := os.Stat(path)
	if err != nil {

		return false
	}
	return s.IsDir()

}

// 判断所给路径是否为文件
//func IsFile(path string) bool {
//
//	return !IsDir(path)
//
//}

func isStrEmpty(s *string) bool {
	if s == nil || len(strings.TrimSpace(*s)) < 1 {
		return true
	}
	return false
}
