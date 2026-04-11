package fuzzer

import (
	"bytes"
	"net/http"
	"sync"
	"time"
)

type Result struct {
	Payload      string `json:"payload"`
	StatusCode   int    `json:"status_code"`
	ResponseTime int64  `json:"response_time_ms"`
	Body         string `json:"body"`
	Anomaly      bool   `json:"anomaly"`
	AnomalyType  string `json:"anomaly_type,omitempty"`
}

type Config struct {
	Target      string   `json:"target"`
	Payloads    []string `json:"payloads"`
	Concurrency int      `json:"concurrency"`
	TimeoutMs   int      `json:"timeout_ms"`
}

func Run(cfg Config) []Result {
	if cfg.Concurrency <= 0 {
		cfg.Concurrency = 10
	}
	if cfg.TimeoutMs <= 0 {
		cfg.TimeoutMs = 5000
	}

	client := &http.Client{
		Timeout: time.Duration(cfg.TimeoutMs) * time.Millisecond,
	}

	results := make([]Result, 0, len(cfg.Payloads))
	mu := sync.Mutex{}
	sem := make(chan struct{}, cfg.Concurrency)
	wg := sync.WaitGroup{}

	for _, payload := range cfg.Payloads {
		wg.Add(1)
		sem <- struct{}{}

		go func(p string) {
			defer wg.Done()
			defer func() { <-sem }()

			r := sendRequest(client, cfg.Target, p)

			mu.Lock()
			results = append(results, r)
			mu.Unlock()
		}(payload)
	}

	wg.Wait()
	return results
}

func sendRequest(client *http.Client, target, payload string) Result {
	start := time.Now()
	result := Result{Payload: payload}

	resp, err := client.Post(
		target,
		"application/json",
		bytes.NewBufferString(payload),
	)
	elapsed := time.Since(start).Milliseconds()
	result.ResponseTime = elapsed

	if err != nil {
		result.Anomaly = true
		result.AnomalyType = "connection_error"
		result.Body = err.Error()
		return result
	}
	defer resp.Body.Close()

	result.StatusCode = resp.StatusCode

	// anomaly 판정 기준
	switch {
	case resp.StatusCode >= 500:
		result.Anomaly = true
		result.AnomalyType = "server_error"
	case elapsed > 3000:
		result.Anomaly = true
		result.AnomalyType = "slow_response"
	case resp.StatusCode == 200 && len(payload) > 10000:
		// 거대 페이로드를 200으로 받으면 의심
		result.Anomaly = true
		result.AnomalyType = "suspicious_accept"
	}

	return result
}
