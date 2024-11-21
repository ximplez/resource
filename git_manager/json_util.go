package main

import (
	"encoding/json"
	"log"
)

func ToJson(data interface{}, pretty bool) string {
	if pretty {
		jsonByte, err := json.MarshalIndent(data, "", "  ")
		if err != nil {
			log.Printf("[ToJson] error. %s", err.Error())
		}
		return string(jsonByte)
	} else {
		jsonByte, _ := json.Marshal(data)
		return string(jsonByte)
	}
}

func PhaseJson[T any](data []byte) *T {
	v := new(T)
	err := json.Unmarshal(data, v)
	if err != nil {
		log.Printf("[PhaseJson] error. %s", err.Error())
	}
	return v
}

func PhaseJsonFromString[T any](data string) *T {
	return PhaseJson[T]([]byte(data))
}
