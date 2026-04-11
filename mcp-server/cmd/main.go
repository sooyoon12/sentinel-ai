package main

import (
    "encoding/json"
    "os"

    "github.com/yourname/sentinel-ai/mcp-server/internal/fuzzer"
    "github.com/yourname/sentinel-ai/mcp-server/internal/mcp"
)

func main() {
    server := mcp.NewServer(os.Stdin, os.Stdout)

    // 도구 1: fuzz_endpoint
    server.RegisterTool(
        mcp.Tool{
            Name:        "fuzz_endpoint",
            Description: "HTTP 엔드포인트에 다양한 페이로드를 주입하여 취약점을 탐색합니다",
            InputSchema: mcp.InputSchema{
                Type: "object",
                Properties: map[string]mcp.Property{
                    "target": {
                        Type:        "string",
                        Description: "퍼징할 URL (예: http://localhost:8080/api/user)",
                    },
                    "category": {
                        Type:        "string",
                        Description: "페이로드 카테고리: sql_injection | overflow | format_string | all",
                    },
                    "concurrency": {
                        Type:        "integer",
                        Description: "동시 요청 수 (기본값: 10)",
                    },
                },
                Required: []string{"target", "category"},
            },
        },
        func(params json.RawMessage) (any, error) {
            var cfg fuzzer.Config
            var args struct {
                Target      string `json:"target"`
                Category    string `json:"category"`
                Concurrency int    `json:"concurrency"`
            }
            json.Unmarshal(params, &args)

            cfg.Target = args.Target
            cfg.Concurrency = args.Concurrency
            cfg.Payloads = fuzzer.GeneratePayloads(args.Category)

            results := fuzzer.Run(cfg)

            // 요약 통계도 함께 반환
            anomalies := 0
            for _, r := range results {
                if r.Anomaly {
                    anomalies++
                }
            }

            return map[string]any{
                "total":     len(results),
                "anomalies": anomalies,
                "results":   results,
            }, nil
        },
    )

    // 도구 2: generate_payloads (페이로드만 생성)
    server.RegisterTool(
        mcp.Tool{
            Name:        "generate_payloads",
            Description: "카테고리별 공격 페이로드 목록을 생성합니다",
            InputSchema: mcp.InputSchema{
                Type: "object",
                Properties: map[string]mcp.Property{
                    "category": {Type: "string",
                        Description: "sql_injection | overflow | format_string | all"},
                },
                Required: []string{"category"},
            },
        },
        func(params json.RawMessage) (any, error) {
            var args struct{ Category string `json:"category"` }
            json.Unmarshal(params, &args)
            return fuzzer.GeneratePayloads(args.Category), nil
        },
    )

    server.Run()
}