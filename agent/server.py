"""HTTP wrapper that lets n8n drive Sentinel-AI using only its built-in
HTTP Request node — no Execute Command needed.

Endpoints:
  GET  /health          liveness
  POST /fuzz            run the Go MCP fuzzer against a target
  POST /heal            hand a fuzzer report to the LangGraph healing agent
  POST /scan-stream     SSE stream of full fuzz→heal pipeline (used by dashboard)
"""

import json
import os
import subprocess
import tempfile
import time

from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS

app = Flask(__name__)
# Open CORS so the Next.js dashboard (localhost:3000) can hit us directly.
CORS(app, resources={r"/*": {"origins": "*"}})

AGENT_SCRIPT = os.environ.get("AGENT_SCRIPT", "/app/healing_agent.py")
FUZZER_BIN = os.environ.get("FUZZER_BIN", "/app/fuzzing-server")
AGENT_CWD = os.environ.get("AGENT_CWD", "/app")
HEAL_TIMEOUT_SEC = int(os.environ.get("HEALER_TIMEOUT_SEC", "300"))
FUZZ_TIMEOUT_SEC = int(os.environ.get("FUZZER_TIMEOUT_SEC", "120"))


# ---------- helpers ---------------------------------------------------------


def _sse(event_name: str, data: dict) -> str:
    """Format a single Server-Sent Events frame."""
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event_name}\ndata: {payload}\n\n"


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _run_fuzzer(target: str, category: str, concurrency: int):
    """Invoke the Go MCP fuzzer via stdio JSON-RPC. Returns the parsed dict."""
    if not os.path.exists(FUZZER_BIN):
        return {"error": f"fuzzer binary not found at {FUZZER_BIN}"}
    if not os.access(FUZZER_BIN, os.X_OK):
        return {"error": f"fuzzer binary not executable: {FUZZER_BIN}"}

    mcp_request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "fuzz_endpoint",
            "arguments": {
                "target": target,
                "category": category,
                "concurrency": concurrency,
            },
        },
    }
    try:
        result = subprocess.run(
            [FUZZER_BIN],
            input=json.dumps(mcp_request),
            capture_output=True,
            text=True,
            timeout=FUZZ_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired:
        return {"error": "fuzzer timeout"}

    if result.returncode != 0:
        return {"error": "fuzzer exited nonzero", "stderr": result.stderr}

    raw = (result.stdout or "").strip()
    lines = [ln for ln in raw.split("\n") if ln]
    if not lines:
        return {"error": "fuzzer produced no stdout", "stderr": result.stderr}

    try:
        rpc = json.loads(lines[-1])
    except json.JSONDecodeError as e:
        return {"error": f"failed to parse JSON-RPC: {e}", "last_line": lines[-1]}

    if "error" in rpc and rpc["error"]:
        return {"error": rpc["error"]}

    res = rpc.get("result", {}) or {}
    fuzz_data = res
    content = res.get("content") if isinstance(res, dict) else None
    if isinstance(content, list) and content:
        first = content[0] or {}
        text = first.get("text") if isinstance(first, dict) else None
        if text:
            try:
                fuzz_data = json.loads(text)
            except Exception:
                pass

    fd = fuzz_data or {}
    results = fd.get("results") or []
    anomalies = [r for r in results if isinstance(r, dict) and r.get("anomaly") is True]
    legacy_vulns = fd.get("vulnerabilities") or []
    vulns = anomalies or legacy_vulns
    total_attempts = fd.get("total_attempts")
    if total_attempts is None:
        total_attempts = fd.get("total", len(results))

    return {
        "target": fd.get("target", target),
        "category": category,
        "vulnerabilities": vulns,
        "vuln_count": len(vulns),
        "total_attempts": total_attempts,
        "anomalies_count": fd.get("anomalies", len(anomalies)),
        "results_count": len(results),
        "raw": fd,
    }


# ---------- endpoints -------------------------------------------------------


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "agent_script_exists": os.path.exists(AGENT_SCRIPT),
            "fuzzer_bin_exists": os.path.exists(FUZZER_BIN),
        }
    )


@app.post("/fuzz")
def fuzz():
    try:
        payload = request.get_json(force=True) or {}
    except Exception as e:
        return jsonify({"ok": False, "error": f"invalid json: {e}"}), 400

    target = payload.get("target")
    if not target:
        return jsonify({"ok": False, "error": "missing 'target'"}), 400
    category = payload.get("category", "sql_injection")
    concurrency = int(payload.get("concurrency", 5))

    out = _run_fuzzer(target, category, concurrency)
    if "error" in out:
        return jsonify({"ok": False, **out}), 500
    return jsonify({"ok": True, **out})


@app.post("/heal")
def heal():
    try:
        payload = request.get_json(force=True) or {}
    except Exception as e:
        return jsonify({"ok": False, "error": f"invalid json: {e}"}), 400

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
        report_path = f.name

    env = {**os.environ, "SENTINEL_VULN_REPORT": report_path, "PYTHONUNBUFFERED": "1"}
    try:
        result = subprocess.run(
            ["python3", AGENT_SCRIPT],
            cwd=AGENT_CWD,
            env=env,
            capture_output=True,
            text=True,
            timeout=HEAL_TIMEOUT_SEC,
        )
        return jsonify(
            {
                "ok": result.returncode == 0,
                "returncode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
            }
        )
    except subprocess.TimeoutExpired as e:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": "timeout",
                    "stdout": (e.stdout or "") if isinstance(e.stdout, str) else "",
                    "stderr": (e.stderr or "") if isinstance(e.stderr, str) else "",
                }
            ),
            504,
        )
    finally:
        try:
            os.unlink(report_path)
        except OSError:
            pass


@app.post("/scan-stream")
def scan_stream():
    """Server-Sent Events: the dashboard's primary endpoint.

    Event types:
      stage   — pipeline phase changes (fuzz_start, fuzz_done, heal_start, complete, error)
      log     — line-by-line stdout from healing_agent.py
    """
    try:
        payload = request.get_json(force=True) or {}
    except Exception as e:
        return jsonify({"ok": False, "error": f"invalid json: {e}"}), 400

    target = payload.get("target")
    if not target:
        return jsonify({"ok": False, "error": "missing 'target'"}), 400
    category = payload.get("category", "sql_injection")
    concurrency = int(payload.get("concurrency", 5))

    def generate():
        scan_started = _now_iso()
        yield _sse(
            "stage",
            {
                "stage": "fuzz_start",
                "target": target,
                "category": category,
                "concurrency": concurrency,
                "ts": scan_started,
            },
        )

        # ----- fuzzing -----
        fuzz_out = _run_fuzzer(target, category, concurrency)
        if "error" in fuzz_out:
            yield _sse("stage", {"stage": "error", "where": "fuzz", "error": fuzz_out["error"], "ts": _now_iso()})
            yield _sse("stage", {"stage": "complete", "status": "error", "ts": _now_iso()})
            return

        yield _sse(
            "stage",
            {
                "stage": "fuzz_done",
                "vuln_count": fuzz_out["vuln_count"],
                "vulnerabilities": fuzz_out["vulnerabilities"],
                "total_attempts": fuzz_out["total_attempts"],
                "results_count": fuzz_out["results_count"],
                "ts": _now_iso(),
            },
        )

        if fuzz_out["vuln_count"] == 0:
            yield _sse(
                "stage",
                {
                    "stage": "complete",
                    "status": "clean",
                    "target": fuzz_out["target"],
                    "category": category,
                    "vulnerabilities": [],
                    "vuln_count": 0,
                    "total_attempts": fuzz_out["total_attempts"],
                    "scan_started": scan_started,
                    "ts": _now_iso(),
                },
            )
            return

        # ----- healing (streamed line by line) -----
        yield _sse("stage", {"stage": "heal_start", "ts": _now_iso()})

        # Hand the fuzzer report to the agent via SENTINEL_VULN_REPORT.
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(fuzz_out, f, ensure_ascii=False)
            report_path = f.name

        env = {
            **os.environ,
            "SENTINEL_VULN_REPORT": report_path,
            "PYTHONUNBUFFERED": "1",
        }

        proc = subprocess.Popen(
            ["python3", "-u", AGENT_SCRIPT],
            cwd=AGENT_CWD,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        all_lines: list[str] = []
        try:
            assert proc.stdout is not None
            for line in iter(proc.stdout.readline, ""):
                if not line:
                    break
                stripped = line.rstrip("\n")
                all_lines.append(stripped)
                yield _sse("log", {"line": stripped, "ts": _now_iso()})

                # Heuristic stage hints based on the agent's existing prints.
                if "[1/3]" in stripped:
                    yield _sse("stage", {"stage": "analyze", "ts": _now_iso()})
                elif "[2/3]" in stripped:
                    yield _sse("stage", {"stage": "patch", "ts": _now_iso()})
                elif "[3/3]" in stripped:
                    yield _sse("stage", {"stage": "validate", "ts": _now_iso()})
                elif "패치 적용 완료" in stripped or "patch 적용 완료" in stripped.lower():
                    yield _sse("stage", {"stage": "apply", "ts": _now_iso()})
        finally:
            proc.wait(timeout=HEAL_TIMEOUT_SEC)
            try:
                os.unlink(report_path)
            except OSError:
                pass

        patch_log = "\n".join(all_lines)
        yield _sse(
            "stage",
            {
                "stage": "complete",
                "status": "healed" if proc.returncode == 0 else "error",
                "target": fuzz_out["target"],
                "category": category,
                "vulnerabilities": fuzz_out["vulnerabilities"],
                "vuln_count": fuzz_out["vuln_count"],
                "total_attempts": fuzz_out["total_attempts"],
                "patch_log": patch_log,
                "healer_returncode": proc.returncode,
                "scan_started": scan_started,
                "ts": _now_iso(),
            },
        )

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
    }
    return Response(stream_with_context(generate()), headers=headers)


if __name__ == "__main__":
    # threaded=True so SSE doesn't block /health & other concurrent requests
    app.run(host="0.0.0.0", port=8001, threaded=True)
