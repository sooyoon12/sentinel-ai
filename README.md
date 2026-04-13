# Sentinel-AI

![MCP](https://img.shields.io/badge/Protocol-MCP-1D9E75) ![Go](https://img.shields.io/badge/Go-1.22-00ACD7) ![Python](https://img.shields.io/badge/Python-3.11-3776AB) ![n8n](https://img.shields.io/badge/n8n-v2.14+-EA4B71) ![Next.js](https://img.shields.io/badge/Next.js-15-black)

Agentic MCP 기반 자가 치유(Self-healing) 보안 시스템.  
AI 에이전트가 소프트웨어 취약점을 스스로 탐색(Fuzzing)하고 실시간으로 코드 패치까지 수행합니다.

---

## 아키텍처

```
제1계층 (지휘)   →   n8n MCP Hub
제2계층 (실행)   →   Go Fuzzing Server
제3계층 (치유)   →   Python LangGraph Agent
제4계층 (시각화) →   Next.js Dashboard
```

---

## 기술 스택

### Go — Performance Engine (Muscle)
- MCP 서버 (stdio JSON-RPC 2.0)
- Goroutine 기반 고성능 동시성 퍼저
- SQL Injection / Buffer Overflow / Format String 페이로드 생성기
- 실시간 시스템 리소스 모니터링

### Python — Reasoning Engine (Brain)
- LangGraph 상태 기반 자가 치유 에이전트 (analyze → patch → validate → apply)
- Ollama 로컬 LLM 연동 (llama3.2:3b, 완전 무료)
- AST 기반 소스코드 취약 함수 탐지 및 패치 생성
- 패치 검증 실패 시 자동 재시도 (최대 2회)

### n8n — Orchestration Hub _(Week 3 예정)_
- MCP Client/Trigger 노드로 에이전트 협업
- 멀티 에이전트 워크플로우 자동화

### Next.js — Dashboard _(Week 4 예정)_
- Vercel AI SDK 실시간 스트리밍
- Chain of Thought 시각화

---

## 프로젝트 구조

```
sentinel-ai/
├── bin/
│   └── fuzzing-server       # Go MCP 서버 바이너리
├── mcp-server/              # Go MCP 퍼징 서버
│   ├── cmd/
│   │   └── main.go
│   └── internal/
│       ├── fuzzer/          # 퍼징 엔진 + 페이로드 생성기
│       ├── monitor/         # 리소스 추적
│       └── mcp/             # MCP 프로토콜 레이어 (JSON-RPC 2.0)
├── agent/                   # Python LangGraph 에이전트
│   ├── healing_agent.py     # LangGraph 메인 그래프
│   ├── analyzer.py          # 에러 분석 노드
│   ├── patcher.py           # AST 패치 생성 노드
│   ├── requirements.txt
│   └── venv/
├── target-server/           # 취약한 테스트 서버 (Go)
│   ├── main.go
│   ├── main.go.bak          # 패치 적용 전 백업
│   └── go.mod
├── dashboard/               # Next.js UI (Week 4)
└── scripts/                 # 빌드/테스트 스크립트
```

---

## 빠른 시작

### 사전 요구사항

- Go 1.22+
- Python 3.11+
- Ollama

### 1. Ollama 모델 준비

```bash
ollama pull llama3.2:3b
ollama serve
```

### 2. 타겟 서버 실행

```bash
cd target-server
go run main.go &
# → 취약한 테스트 서버 시작: http://localhost:8080
```

### 3. MCP 퍼징 서버 빌드 및 테스트

```bash
cd mcp-server
go build -o ../bin/fuzzing-server ./cmd/

# 도구 목록 확인
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | ../bin/fuzzing-server

# SQL Injection 퍼징 실행
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fuzz_endpoint","arguments":{"target":"http://localhost:8080/api/user","category":"sql_injection","concurrency":5}}}' \
  | ../bin/fuzzing-server
```

### 4. 자가 치유 에이전트 실행

```bash
cd agent
source venv/bin/activate
python3 healing_agent.py
```

예상 출력:
```
[1/3] 에러 분석 중...
  취약점: sql_injection (severity: high)
  설명: id 필드에서 SQL 인젝션 취약점 발견

[2/3] 패치 생성 중...
  수정된 함수: ['userHandler']

[3/3] 패치 검증 중...
  결과: 통과 — 검증 통과

패치 적용 완료: ../target-server/main.go
백업: ../target-server/main.go.bak
```

---

## MCP 도구 명세

| 도구명 | 설명 | 필수 파라미터 |
|---|---|---|
| `fuzz_endpoint` | HTTP 엔드포인트 취약점 탐색 | `target`, `category` |
| `generate_payloads` | 카테고리별 공격 페이로드 생성 | `category` |

**category 옵션:** `sql_injection` \| `overflow` \| `format_string` \| `all`

---

## LangGraph 에이전트 플로우

```
[analyze] → [patch] → [validate] → (통과) → [apply] → END
                          ↓
                       (실패, 재시도 < 2)
                          ↓
                        [retry] → [patch]
                          ↓
                       (실패, 재시도 >= 2)
                          ↓
                         END
```

---

## 환경 변수

```env
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2:3b
```

---

## 개발 로드맵

| 주차 | 내용 | 상태 |
|---|---|---|
| Week 1 | Go MCP 서버 + 퍼징 엔진 |  완료 |
| Week 2 | Python LangGraph 자가 치유 에이전트 |  완료 |
| Week 3 | n8n MCP Hub 워크플로우 연결 | 🔜 예정 |
| Week 4 | Next.js 실시간 대시보드 | 🔜 예정 |

---

## 알려진 이슈

- `llama3.2:3b` 모델은 간혹 불완전한 Go 코드를 생성할 수 있습니다. 이 경우 `retry` 노드가 자동으로 재시도합니다.
- 패치 적용 전 항상 `.bak` 백업이 생성됩니다. 롤백이 필요하면 `.bak` 파일을 복원하세요.