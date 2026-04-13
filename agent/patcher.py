import ast
import json
import difflib
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage

llm = ChatOllama(model="llama3.2:3b", temperature=0)


def generate_patch(source_code: str, analysis: dict) -> dict:
    """LLM으로 패치 코드 생성"""

    # AST로 취약 함수 파악
    vulnerable_functions = _find_vulnerable_functions(source_code, analysis.get("target_field", ""))

    prompt = f"""You are a Go security expert. Fix the vulnerability in this code.

Vulnerability: {analysis.get("vulnerability")}
Description: {analysis.get("description")}
Vulnerable field: {analysis.get("target_field")}
Vulnerable functions: {vulnerable_functions}

Original Go code:
```go
{source_code}
```

Rules:
1. Add input validation for the vulnerable field
2. Return HTTP 400 for dangerous inputs, NOT 500
3. Keep all existing logic intact
4. Respond with ONLY the complete fixed Go code, no explanation

Fixed code:"""

    response = llm.invoke([HumanMessage(content=prompt)])

    patch_code = response.content.strip()
    if "```go" in patch_code:
        patch_code = patch_code.split("```go")[1].split("```")[0].strip()
    elif "```" in patch_code:
        patch_code = patch_code.split("```")[1].split("```")[0].strip()

    return {
        "patch_code": patch_code,
        "diff": _generate_diff(source_code, patch_code),
        "functions_modified": vulnerable_functions,
    }


def _find_vulnerable_functions(source_code: str, target_field: str) -> list[str]:
    """소스에서 취약 필드를 다루는 함수 이름 추출"""
    vulnerable = []
    lines = source_code.split("\n")
    current_func = None

    for line in lines:
        if line.startswith("func "):
            current_func = line.split("func ")[1].split("(")[0]
        if target_field and target_field in line and current_func:
            if current_func not in vulnerable:
                vulnerable.append(current_func)

    return vulnerable


def _generate_diff(original: str, patched: str) -> str:
    """읽기 쉬운 diff 생성"""
    diff = difflib.unified_diff(
        original.splitlines(keepends=True),
        patched.splitlines(keepends=True),
        fromfile="original",
        tofile="patched",
        n=3,
    )
    return "".join(list(diff))


def validate_patch(patch_code: str) -> tuple[bool, str]:
    """패치 코드 기본 검증"""
    if not patch_code.strip():
        return False, "빈 패치 코드"
    if "package main" not in patch_code:
        return False, "package main 없음"
    if len(patch_code) < 100:
        return False, "패치 코드가 너무 짧음"
    return True, "검증 통과"
