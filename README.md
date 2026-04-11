
# Sentinel-AI

MCPGo 1.22Python 3.11n8n v2.14+Next.js

Agentic MCP 기반 자가 치유(Self-healing) 보안 시스템.
AI 에이전트가 소프트웨어 취약점을 스스로 탐색(Fuzzing)하고
실시간으로 코드 패치까지 수행합니다.

## 아키텍처

  제1계층 (지휘)   →   n8n MCP Hub
  제2계층 (실행)   →   Go Fuzzing Server  
  제3계층 (치유)   →   Python LangGraph Agent
  제4계층 (시각화) →   Next.js Dashboard

## 기술 스택

### Go — Performance Engine (Muscle)
- MCP 서버 (stdio JSON-RPC 2.0)
- Goroutine 기반 고성능 동시성 퍼저
- 실시간 시스템 리소스 모니터링

### Python — Reasoning Engine (Brain)
- LangGraph 상태 기반 자가 치유 에이전트
- Ollama 로컬 LLM 연동 (무료)
- AST 기반 소스코드 분석 및 패치 생성

### n8n — Orchestration Hub
- MCP Client/Trigger 노드로 에이전트 협업
- 멀티 에이전트 워크플로우 자동화

### Next.js — Dashboard
- Vercel AI SDK 실시간 스트리밍
- Chain of Thought 시각화

## 프로젝트 구조

  sentinel-ai/
  ├── mcp-server/          # Go MCP 퍼징 서버
  │   ├── cmd/main.go
  │   └── internal/
  │       ├── fuzzer/      # 퍼징 엔진 + 페이로드
  │       ├── monitor/     # 리소스 추적
  │       └── mcp/         # MCP 프로토콜 레이어
  ├── agent/               # Python LangGraph 에이전트
  ├── dashboard/           # Next.js UI
  ├── target-server/       # 취약한 테스트 서버
  └── scripts/             # 빌드/테스트 스크립트

## 빠른 시작

  # 1. 타겟 서버 실행
  cd target-server && go run main.go &

  # 2. MCP 서버 빌드
  cd mcp-server && go build -o ../bin/fuzzing-server ./cmd/

  # 3. 퍼징 테스트
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
    | ./bin/fuzzing-server

## 개발 로드맵

  Week 1 ██████░░  Go MCP 서버 + 퍼징 엔진
  Week 2 ░░░░░░░░  Python LangGraph 에이전트
  Week 3 ░░░░░░░░  n8n 워크플로우 연결
  Week 4 ░░░░░░░░  Next.js 대시보드

## LLM 설정 

  # Ollama로 로컬 LLM 실행
  ollama pull llama3.1:8b
  ollama serve

  # .env
  OLLAMA_BASE_URL=http://localhost:11434
  LLM_MODEL=llama3.1:8b
    