# Sentinel-AI

![MCP](https://img.shields.io/badge/Protocol-MCP-1D9E75) ![Go](https://img.shields.io/badge/Go-1.22-00ACD7) ![Python](https://img.shields.io/badge/Python-3.11-3776AB) ![n8n](https://img.shields.io/badge/n8n-latest-EA4B71) ![Docker](https://img.shields.io/badge/Docker-Compose-2496ED) ![Next.js](https://img.shields.io/badge/Next.js-15-black) ![SSE](https://img.shields.io/badge/Stream-SSE-7C3AED)

Agentic MCP 기반 자가 치유(Self-healing) 보안 시스템.
AI 에이전트가 소프트웨어 취약점을 스스로 탐색(Fuzzing)하고 실시간으로 코드 패치까지 수행합니다.

**Week 4 완료** — 백엔드(퍼징 → LLM 패치 → 검증 → 적용) 위에 Next.js 콘솔이 얹어져, 모든 단계가 SSE로 실시간 스트리밍됩니다. 다크 보안 운영 테마 UI에서 클릭 한 번으로 스캔하고 LangGraph의 추론 흐름을 줄 단위로 관찰할 수 있어요.

---

## 아키텍처

```
제1계층 (지휘)   →   n8n Webhook Hub            http://localhost:5678
제2계층 (실행)   →   Go MCP Fuzzer (stdio)       /app/fuzzing-server
제3계층 (치유)   →   Python LangGraph Agent     http://localhost:8001
제4계층 (시각화) →   Next.js Dashboard           http://localhost:3000  ✅
```

### 런타임 토폴로지

n8n과 Python 에이전트를 각각 Docker 컨테이너로 분리하고, MCP 퍼저 바이너리는 healer 컨테이너 안에서 stdio로 실행합니다. 대시보드는 별도 Node 프로세스로 호스트에서 돌고, healer의 SSE 엔드포인트에 직접 붙어요. n8n 웹훅은 외부 자동화/CI 통합용으로 그대로 살아 있습니다.

```
┌──────────────┐    POST /webhook/sentinel-scan   ┌──────────────────────┐
│   curl/CI    │ ─────────────────────────────▶  │  sentinel-n8n        │
└──────────────┘                                  │  (n8nio/n8n:latest)  │
                                                  │                      │
┌──────────────┐    POST /scan-stream (SSE)       │  Webhook → Normalize │
│   Next.js    │ ─────────────────────────────┐   │    → HTTP /fuzz      │
│  Dashboard   │ ◀─── event stream ───────┐   │   │    → Parse → IF      │
│  :3000       │                          │   │   │    → HTTP /heal      │
└──────────────┘                          │   │   │    → Respond         │
                                          │   │   └──────────┬───────────┘
                                          │   │              │
                                          │   ▼              ▼
                                          │  ┌──────────────────────────┐
                                          │  │  sentinel-healer         │
                                          │  │  (python:3.11 + flask    │
                                          │  │   + flask-cors           │
                                          │  │   + langgraph)           │
                                          │  │                          │
                                          └──┤  server.py               │
                                             │   ├─ /scan-stream (SSE)  │
                                             │   ├─ /fuzz   → Go binary │
                                             │   ├─ /heal   → agent.py  │
                                             │   └─ /health             │
                                             └──────────┬───────────────┘
                                                        │
                                          host.docker.internal:11434
                                                        ▼
                                             ┌──────────────────────┐
                                             │  Ollama (호스트)     │
                                             │  llama3.2:3b         │
                                             └──────────────────────┘

                                             ┌──────────────────────┐
                                             │  target-server       │
                                             │  (호스트 :8080)      │
                                             │  취약한 Go API 서버  │
                                             └──────────────────────┘
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
- Flask + Flask-CORS HTTP 래퍼 (`/fuzz`, `/heal`, `/scan-stream`, `/health`)

### n8n — Orchestration Hub _(Week 3 완료)_
- Webhook 트리거 → HTTP Request → Code → IF → Respond 조합
- Execute Command 없이 기본 노드만 사용 (최신 n8n 이미지 호환)
- 워크플로우 JSON import만으로 파이프라인 재구성 가능

### Next.js — Dashboard _(Week 4 완료)_
- Next.js 15 App Router + TypeScript + Tailwind CSS
- SSE 스트리밍 — `fetch` + `ReadableStream`으로 직접 파싱 (POST 지원)
- 6단계 파이프라인 카드 시각화 (Fuzz → Detect → Analyze → Patch → Validate → Apply)
- 컬러링되는 라이브 로그 터미널 (`[1/3]`/`[2/3]`/`[3/3]` 단계별 컬러, diff `+/-` 하이라이트)
- localStorage 기반 스캔 히스토리 (최근 50개) + hover 시 ↻ retry / ✕ del
- 다크 보안 운영 테마 (zinc + emerald, 모노스페이스, 스캔라인 효과)

---

## 프로젝트 구조

```
sentinel-ai/
├── docker-compose.yml       # n8n + healer 컨테이너 오케스트레이션
├── n8n-workflow.json        # n8n에 import할 파이프라인 정의
├── bin/
│   └── fuzzing-server       # Go MCP 서버 바이너리 (Linux)
├── mcp-server/              # Go MCP 퍼징 서버
│   ├── cmd/
│   │   └── main.go
│   └── internal/
│       ├── fuzzer/          # 퍼징 엔진 + 페이로드 생성기
│       ├── monitor/         # 리소스 추적
│       └── mcp/             # MCP 프로토콜 레이어 (JSON-RPC 2.0)
├── agent/                   # Python LangGraph 에이전트 + HTTP 래퍼
│   ├── Dockerfile           # healer 컨테이너 이미지 정의
│   ├── server.py            # Flask 래퍼 (/fuzz, /heal, /scan-stream, /health)
│   ├── healing_agent.py     # LangGraph 메인 그래프
│   ├── analyzer.py          # 에러 분석 노드 (Ollama 호출)
│   ├── patcher.py           # AST 패치 생성 노드
│   └── requirements.txt     # flask, flask-cors, langgraph, langchain-ollama 등
├── target-server/           # 취약한 테스트 서버 (Go)
│   ├── main.go
│   ├── main.go.bak          # 패치 적용 전 백업 (런타임 생성)
│   └── go.mod
├── dashboard/               # Next.js 실시간 콘솔
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx         # 메인 콘솔
│   │   └── globals.css      # 다크 테마 + 스캔라인
│   ├── components/
│   │   ├── ScanForm.tsx
│   │   ├── StagePipeline.tsx
│   │   ├── LiveLog.tsx
│   │   ├── ScanResult.tsx
│   │   └── HistoryList.tsx
│   ├── hooks/
│   │   └── useScanStream.ts # SSE 파서 훅
│   ├── lib/
│   │   ├── types.ts
│   │   └── history.ts       # localStorage CRUD
│   ├── tailwind.config.ts
│   └── .env.local           # NEXT_PUBLIC_HEALER_URL
└── scripts/                 # 빌드/테스트 스크립트
```

---

## 빠른 시작

### 사전 요구사항

- Docker Desktop (Compose v2)
- Go 1.22+
- Node.js 18+ (Next.js 15용)
- Ollama + `llama3.2:3b` 모델

### 1. Ollama 준비 (호스트)

```bash
ollama pull llama3.2:3b
ollama serve                  # 이 창은 그대로 두기
```

### 2. MCP 퍼징 서버를 Linux용으로 빌드

healer 컨테이너는 Linux라 맥/윈도우에서 `go build`한 바이너리는 못 돌립니다.

```bash
cd mcp-server
# Apple Silicon
GOOS=linux GOARCH=arm64 go build -o ../bin/fuzzing-server ./cmd/
# Intel
# GOOS=linux GOARCH=amd64 go build -o ../bin/fuzzing-server ./cmd/
```

### 3. 타겟 서버 실행 (호스트)

```bash
cd target-server
go run main.go                # 취약한 테스트 서버 시작: :8080
```

### 4. n8n + healer 컨테이너 기동

```bash
docker compose up -d --build
docker compose ps             # sentinel-n8n, sentinel-healer 둘 다 running
curl http://localhost:8001/health
# {"ok":true,"agent_script_exists":true,"fuzzer_bin_exists":true}
```

### 5. n8n에 워크플로우 import (선택, 외부 자동화용)

브라우저로 `http://localhost:5678` → **Workflows** → ⋮ → **Import from File** → `n8n-workflow.json` → **Active** 토글 ON.

대시보드만 쓸 거면 5번 단계는 건너뛰어도 됨.

### 6. 대시보드 실행 (호스트)

```bash
cd dashboard
npm install                   # 최초 1회
npm run dev
```

브라우저에서 **http://localhost:3000** 접속. 헤더 우측에 `healer ● online` 표시되면 준비 완료.

### 7. 스캔 실행

대시보드의 **Initiate Scan** 폼에 기본값 그대로 두고 ▶ Run Scan. 또는 외부에서:

```bash
# n8n 웹훅 (1회성, request/response)
curl -X POST http://localhost:5678/webhook/sentinel-scan \
  -H "Content-Type: application/json" \
  -d '{"target":"http://host.docker.internal:8080/api/user","category":"sql_injection","concurrency":5}'

# healer SSE (실시간 스트림)
curl -N -X POST http://localhost:8001/scan-stream \
  -H "Content-Type: application/json" \
  -d '{"target":"http://host.docker.internal:8080/api/user","category":"sql_injection","concurrency":5}'
```

취약점이 있으면 `target-server/main.go`가 자동 수정되고 `main.go.bak`이 생성됩니다. 타겟 서버 프로세스에 변경을 반영하려면 `Ctrl+C` 후 `go run main.go` 재실행.

---

## MCP 도구 명세

| 도구명 | 설명 | 필수 파라미터 |
|---|---|---|
| `fuzz_endpoint` | HTTP 엔드포인트 취약점 탐색 | `target`, `category` |
| `generate_payloads` | 카테고리별 공격 페이로드 생성 | `category` |

**category 옵션:** `sql_injection` \| `overflow` \| `format_string` \| `all`

---

## Healer HTTP API

| Endpoint | Method | 용도 |
|---|---|---|
| `/health` | GET | 컨테이너 및 마운트 상태 체크 |
| `/fuzz` | POST | MCP 퍼저를 stdio로 실행하고 결과 정규화 반환 |
| `/heal` | POST | 퍼저 결과를 받아 `healing_agent.py` 동기 실행 |
| `/scan-stream` | POST | 풀 파이프라인을 SSE로 스트리밍 (대시보드 전용) |

### `/scan-stream` 이벤트 타입

| event | 시점 | 페이로드 핵심 필드 |
|---|---|---|
| `stage` | 단계 변화 | `stage` (`fuzz_start`/`fuzz_done`/`heal_start`/`analyze`/`patch`/`validate`/`apply`/`complete`/`error`) |
| `log` | 에이전트 stdout 한 줄마다 | `line`, `ts` |

`stage: complete` 이벤트가 종료 신호이며 `status: "healed" \| "clean" \| "error"`와 전체 `patch_log`를 포함합니다.

```bash
curl -N -X POST http://localhost:8001/scan-stream \
  -H "Content-Type: application/json" \
  -d '{"target":"http://host.docker.internal:8080/api/user","category":"sql_injection","concurrency":5}'
```

---

## n8n 워크플로우 구조

```
Webhook (POST /webhook/sentinel-scan)
    │
    ▼
Normalize Input (target / category / concurrency 기본값 채우기)
    │
    ▼
Run MCP Fuzzer (HTTP POST healer:8001/fuzz)
    │
    ▼
Parse MCP Response (vulnerabilities 배열 정규화)
    │
    ▼
Vulnerability Found?  ──(vuln_count == 0)──▶  Respond (Clean)
    │
    │(vuln_count > 0)
    ▼
Run Healing Agent (HTTP POST healer:8001/heal)
    │
    ▼
Respond (Healed) — 퍼징 결과 + 패치 로그 반환
```

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

## 대시보드 화면 구성

브라우저 `http://localhost:3000`:

- **헤더** — 우측에 `healer ● online/offline` 표시
- **Initiate Scan** 카드 — target URL / category / concurrency 입력, ▶ Run Scan / ■ Abort
- **Pipeline** 카드 — 6단계가 좌→우로 색이 바뀜 (RUN → OK → FAIL/SKIP)
- **Live Stream** 터미널 — 컨테이너 stdout이 한 줄씩 들어오며 stage별 컬러링
  - `[1/3]` 분석 = sky · `[2/3]` 패치 = amber · `[3/3]` 검증 = fuchsia
  - diff `+` = emerald · `-` = red
- **Result** 패널 — status 배지(HEALED/CLEAN/ERROR), Findings 카드, 접을 수 있는 patch_log
- **History** 사이드바 — 최근 50개 스캔(localStorage), hover 시 ↻ retry / ✕ del

---

## 환경 변수

컨테이너 런타임은 `docker-compose.yml`이 주입합니다.

| 변수 | 기본값 | 비고 |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` | healer에서 호스트 Ollama로 접근 |
| `LLM_MODEL` | `llama3.2:3b` | |
| `FUZZER_BIN` | `/app/fuzzing-server` | 컨테이너 안 바이너리 경로 |
| `AGENT_SCRIPT` | `/app/healing_agent.py` | |
| `FUZZER_TIMEOUT_SEC` | `120` | /fuzz 엔드포인트 서브프로세스 타임아웃 |
| `HEALER_TIMEOUT_SEC` | `300` | /heal · /scan-stream 서브프로세스 타임아웃 |
| `NEXT_PUBLIC_HEALER_URL` | `http://localhost:8001` | 대시보드(`.env.local`)에서 healer 위치 지정 |

호스트에서 에이전트를 단독으로 돌릴 땐 `OLLAMA_BASE_URL=http://localhost:11434`.

---

## 개발 로드맵

| 주차 | 내용 | 상태 |
|---|---|---|
| Week 1 | Go MCP 서버 + 퍼징 엔진 | ✅ 완료 |
| Week 2 | Python LangGraph 자가 치유 에이전트 | ✅ 완료 |
| Week 3 | n8n MCP Hub 워크플로우 연결 (Docker Compose 오케스트레이션) | ✅ 완료 |
| Week 4 | Next.js 실시간 대시보드 + SSE 스트리밍 | ✅ 완료 |

---

## 자주 막히는 부분

- **`curl /fuzz`가 `total_attempts: 0`으로만 돌아옴**
  타겟 엔드포인트가 이미 패치된 상태. `target-server/main.go.bak`을 `main.go`로 복원 후 재기동.

- **`/heal`이 `httpx.ConnectError: Connection refused`**
  healer 컨테이너에서 호스트 Ollama로 못 감. 호스트에서 `ollama serve` 떠 있는지, `OLLAMA_BASE_URL`이 `http://host.docker.internal:11434`로 세팅됐는지, 리눅스라면 `extra_hosts: "host.docker.internal:host-gateway"` 들어갔는지 확인.

- **`NameError: name 'os' is not defined`**
  `analyzer.py` / `patcher.py`에서 `os.environ.get(...)`을 쓰는데 `import os`가 빠진 경우. 파일 상단에 추가.

- **`docker compose build`가 I/O error로 실패**
  맥 디스크 부족. Docker Desktop → Settings → Troubleshoot → **Clean / Purge data**로 공간 확보.

- **n8n이 `Unrecognized node type: n8n-nodes-base.executeCommand`**
  최신 n8n에서 Execute Command 노드가 기본 제외됨. 이 프로젝트는 이미 HTTP Request 노드 기반이라 새 `n8n-workflow.json`을 import하면 됨.

- **`FileNotFoundError: '../target-server/main.go'`**
  `docker-compose.yml`에 `./target-server:/target-server:rw` mount가 빠짐. healing_agent가 상대경로로 타겟에 접근하기 때문.

- **대시보드에서 `healer ● offline`**
  대시보드가 healer로 못 감. `dashboard/.env.local`의 `NEXT_PUBLIC_HEALER_URL`이 맞는지, 호스트에서 `curl http://localhost:8001/health`가 직접 되는지 확인.

- **CORS 오류 (브라우저 콘솔 `Access-Control-Allow-Origin`)**
  healer 이미지가 옛날 버전. `requirements.txt`에 `flask-cors`가 들어간 상태로 `docker compose up -d --build` 다시.

- **Live Stream이 한 번에 와르르 나옴**
  파이썬 출력 버퍼링. `server.py`가 `python3 -u`로 띄우고 `PYTHONUNBUFFERED=1`을 세팅하지만, healer 재기동(`docker compose restart healer`)으로도 안 풀리면 컨테이너 안에서 `pip show flask`로 버전 확인.

- **`Module not found: Can't resolve '@/hooks/useScanStream'` (Next.js)**
  파일명 대소문자 불일치. macOS는 case-insensitive지만 Turbopack은 strict함. `mv hooks/useScanstream.ts hooks/_tmp.ts && mv hooks/_tmp.ts hooks/useScanStream.ts`로 정정 후 dev 서버 재시작.

---

## 알려진 이슈

- `llama3.2:3b` 모델은 간혹 불완전한 Go 코드를 생성하거나 한글 설명을 망가뜨림. 패치 자체는 검증 노드를 통과해야만 적용되며, 실패 시 `retry`가 최대 2회 자동 시도.
- 패치 적용 전 항상 `.bak` 백업이 생성. 롤백이 필요하면 `.bak` 파일을 복원.
- `bin/fuzzing-server`는 호스트 OS/아키텍처에 종속. healer 컨테이너용으로 반드시 `GOOS=linux`로 재빌드 필요.
- 타겟 서버는 `go run main.go` 프로세스에 소스가 로드되므로, 자동 패치 반영을 보려면 수동으로 재기동해야 함.
- 퍼저는 connection refused 응답도 anomaly로 분류. 타겟 서버가 꺼져 있으면 false positive로 잡히니 스캔 전 `curl http://localhost:8080/api/user -X POST -d '{}'` 등으로 살아 있는지 확인.