import json
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage
import os

llm = ChatOllama(
    model=os.environ.get("LLM_MODEL", "llama3.2:3b"),
    base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
)


def analyze_errors(fuzz_results: list[dict]) -> dict:
    anomalies = [r for r in fuzz_results if r.get("anomaly")]

    if not anomalies:
        return {"vulnerability": "none", "description": "취약점 없음", "target_field": ""}

    prompt = f"""You are a security analyst. Analyze these fuzzing results and identify the vulnerability.

Fuzzing anomalies found:
{json.dumps(anomalies, indent=2)}

Respond ONLY in this JSON format, nothing else:
{{
  "vulnerability": "sql_injection" | "buffer_overflow" | "format_string" | "other",
  "description": "one sentence explanation in Korean",
  "target_field": "the vulnerable input field name",
  "severity": "high" | "medium" | "low"
}}"""

    response = llm.invoke([HumanMessage(content=prompt)])

    # JSON 파싱 (LLM이 마크다운 붙이는 경우 처리)
    text = response.content.strip()
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]

    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        # 파싱 실패시 기본값
        return {"vulnerability": "unknown", "description": text[:200], "target_field": "id", "severity": "high"}
