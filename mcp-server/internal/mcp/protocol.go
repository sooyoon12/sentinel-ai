package mcp

import (
    "bufio"
    "encoding/json"
    "io"
    "log"
)

// ── MCP 표준 타입 ──────────────────────────────────────────

type Request struct {
    JSONRPC string          `json:"jsonrpc"`
    ID      any             `json:"id"`
    Method  string          `json:"method"`
    Params  json.RawMessage `json:"params,omitempty"`
}

type Response struct {
    JSONRPC string  `json:"jsonrpc"`
    ID      any     `json:"id"`
    Result  any     `json:"result,omitempty"`
    Error   *RPCErr `json:"error,omitempty"`
}

type RPCErr struct {
    Code    int    `json:"code"`
    Message string `json:"message"`
}

// MCP 도구 정의 (AI가 이 스펙을 읽고 호출 방법을 이해함)
type Tool struct {
    Name        string     `json:"name"`
    Description string     `json:"description"`
    InputSchema InputSchema `json:"inputSchema"`
}

type InputSchema struct {
    Type       string              `json:"type"`
    Properties map[string]Property `json:"properties"`
    Required   []string            `json:"required"`
}

type Property struct {
    Type        string `json:"type"`
    Description string `json:"description"`
}

// ── Server ────────────────────────────────────────────────

type HandlerFunc func(params json.RawMessage) (any, error)

type Server struct {
    tools    []Tool
    handlers map[string]HandlerFunc
    reader   *bufio.Scanner
    writer   *json.Encoder
}

func NewServer(r io.Reader, w io.Writer) *Server {
    return &Server{
        handlers: make(map[string]HandlerFunc),
        reader:   bufio.NewScanner(r),
        writer:   json.NewEncoder(w),
    }
}

func (s *Server) RegisterTool(tool Tool, handler HandlerFunc) {
    s.tools = append(s.tools, tool)
    s.handlers[tool.Name] = handler
}

func (s *Server) Run() {
    for s.reader.Scan() {
        var req Request
        if err := json.Unmarshal(s.reader.Bytes(), &req); err != nil {
            log.Printf("parse error: %v", err)
            continue
        }
        resp := s.dispatch(req)
        s.writer.Encode(resp)
    }
}

func (s *Server) dispatch(req Request) Response {
    switch req.Method {

    // AI가 처음 연결할 때 서버 정보 요청
    case "initialize":
        return Response{
            JSONRPC: "2.0", ID: req.ID,
            Result: map[string]any{
                "protocolVersion": "2024-11-05",
                "serverInfo": map[string]string{
                    "name":    "sentinel-fuzzer",
                    "version": "1.0.0",
                },
                "capabilities": map[string]any{"tools": map[string]any{}},
            },
        }

    // AI가 사용 가능한 도구 목록 요청
    case "tools/list":
        return Response{
            JSONRPC: "2.0", ID: req.ID,
            Result: map[string]any{"tools": s.tools},
        }

    // AI가 실제 도구 호출
    case "tools/call":
        var p struct {
            Name      string          `json:"name"`
            Arguments json.RawMessage `json:"arguments"`
        }
        json.Unmarshal(req.Params, &p)

        handler, ok := s.handlers[p.Name]
        if !ok {
            return Response{
                JSONRPC: "2.0", ID: req.ID,
                Error: &RPCErr{Code: -32601, Message: "tool not found: " + p.Name},
            }
        }

        result, err := handler(p.Arguments)
        if err != nil {
            return Response{
                JSONRPC: "2.0", ID: req.ID,
                Error: &RPCErr{Code: -32000, Message: err.Error()},
            }
        }
        return Response{JSONRPC: "2.0", ID: req.ID, Result: result}

    default:
        return Response{
            JSONRPC: "2.0", ID: req.ID,
            Error:   &RPCErr{Code: -32601, Message: "method not found"},
        }
    }
}