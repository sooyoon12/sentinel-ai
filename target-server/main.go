package main

import (
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"time"
)

// ⚠️ 의도적으로 취약하게 만든 테스트 서버

func main() {
	http.HandleFunc("/api/user", userHandler)
	http.HandleFunc("/api/search", searchHandler)
	http.HandleFunc("/api/slow", slowHandler)

	log.Println("취약한 테스트服务器 시작: http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}

// 취약점 1: SQL Injection 흉내 (실제 DB 없이 시뮬레이션)
func userHandler(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	json.NewDecoder(r.Body).Decode(&body)

	id, _ := body["id"].(string)

	// 취약한 패턴: 입력값 그대로 사용
	if !validateId(id) {
		http.Error(w, "Invalid ID", 400)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{
		"id": id, "name": "testuser",
	})
}

// 취약점 2: 느린 응답 (DoS 시뮬레이션)
func slowHandler(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	json.NewDecoder(r.Body).Decode(&body)

	data, _ := body["data"].(string)

	// 입력 크기에 비례해서 느려짐 (의도적 취약점)
	delay := len(data) / 100
	if delay > 10 {
		delay = 10
	}
	time.Sleep(time.Duration(delay) * time.Second)

	w.Write([]byte("ok"))
}

// 취약점 3: 큰 입력 그대로 에코
func searchHandler(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	json.NewDecoder(r.Body).Decode(&body)
	json.NewEncoder(w).Encode(body) // 입력 그대로 반환
}

// ID 유효성 확인 함수
func validateId(id string) bool {
	idRegex := regexp.MustCompile(`^[a-zA-Z0-9]+$`)
	return idRegex.MatchString(id)
}
