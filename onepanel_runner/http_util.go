package main

import (
	"time"

	"github.com/go-resty/resty/v2"
)

var client = resty.New().
	SetTimeout(10 * time.Minute).
	SetRetryCount(1)
