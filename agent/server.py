"""HTTP wrapper that lets n8n drive Sentinel-AI using only its built-in
HTTP Request node — no Execute Command needed.

Endpoints:
  GET  /health          liveness
  POST /fuzz            run the Go MCP fuzzer against a target
  POST /heal            hand a fuzzer report to the LangGraph healing agent
"""

import json
import os
import subprocess
import tempfile

from flask import Flask, jsonify, request

app = Flask(__name__)

AGENT_SCRIPT = os.environ.get("AGENT_SCRIPT", "/app/healing_agent.py")
FUZZER_BIN = os.environ.get("FUZZER_BIN", "/app/fuzzing-server")
HEAL_TIMEOUT_SEC = int(os.environ.get("HEALER_TIMEOUT_SEC", "300"))
FUZZ_TIMEOUT_SEC = int(os.environ.get("FUZZER_TIMEOUT_SEC", "120"))


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
    """Invoke the MCP fuzzer via stdio JSON-RPC and return a parsed summary."""
    try:
        payload = request.get_json(force=True) or {}
    except Exception as e:
        return jsonify({"ok": False, "error": f"invalid json: {e}"}), 400

    target = payload.get("target")
    if not target:
        return jsonify({"ok": False, "error": "missing 'target'"}), 400
    category = payload.get("category", "sql_injection")
    concurrency = int(payload.get("concurrency", 5))

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

    if not os.path.exists(FUZZER_BIN):
        return jsonify({"ok": False, "error": f"fuzzer binary not found at {FUZZER_BIN}"}), 500
    if not os.access(FUZZER_BIN, os.X_OK):
        return jsonify({"ok": False, "error": f"fuzzer binary at {FUZZER_BIN} is not executable"}), 500

    try:
        result = subprocess.run(
            [FUZZER_BIN],
            input=json.dumps(mcp_request),
            capture_output=True,
            text=True,
            timeout=FUZZ_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired:
        return jsonify({"ok": False, "error": "fuzzer timeout"}), 504

    if result.returncode != 0:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": "fuzzer exited nonzero",
                    "returncode": result.returncode,
                    "stderr": result.stderr,
                }
            ),
            500,
        )

    raw = (result.stdout or "").strip()
    lines = [ln for ln in raw.split("\n") if ln]
    if not lines:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": "fuzzer produced no stdout",
                    "stderr": result.stderr,
                }
            ),
            500,
        )

    try:
        rpc = json.loads(lines[-1])
    except json.JSONDecodeError as e:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": f"failed to parse JSON-RPC: {e}",
                    "last_line": lines[-1],
                }
            ),
            500,
        )

    if "error" in rpc and rpc["error"]:
        return jsonify({"ok": False, "error": rpc["error"]}), 500

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

    # The Go MCP fuzzer returns a payload like:
    #   { target?, total: N, anomalies: M, results: [{payload, status_code, body, response_time_ms, anomaly}, ...] }
    # Map it onto a stable shape for n8n / the healer.
    fd = fuzz_data or {}
    results = fd.get("results") or []
    # An "anomaly" in the fuzzer is a candidate vulnerability.
    anomalies = [r for r in results if isinstance(r, dict) and r.get("anomaly") is True]
    # Some builds of the fuzzer already use {vulnerabilities: [...]}; fall back to that.
    legacy_vulns = fd.get("vulnerabilities") or []
    vulns = anomalies or legacy_vulns
    total_attempts = fd.get("total_attempts")
    if total_attempts is None:
        total_attempts = fd.get("total", len(results))
    return jsonify(
        {
            "ok": True,
            "target": fd.get("target", target),
            "category": category,
            "vulnerabilities": vulns,
            "vuln_count": len(vulns),
            "total_attempts": total_attempts,
            "anomalies_count": fd.get("anomalies", len(anomalies)),
            "results_count": len(results),
            "raw": fd,
        }
    )


@app.post("/heal")
def heal():
    """Hand a fuzzer report to healing_agent.py via SENTINEL_VULN_REPORT."""
    try:
        payload = request.get_json(force=True) or {}
    except Exception as e:
        return jsonify({"ok": False, "error": f"invalid json: {e}"}), 400

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
        report_path = f.name

    env = {
        **os.environ,
        "SENTINEL_VULN_REPORT": report_path,
        "PYTHONUNBUFFERED": "1",
    }

    try:
        result = subprocess.run(
            ["python3", AGENT_SCRIPT],
            cwd="/app",
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001)
