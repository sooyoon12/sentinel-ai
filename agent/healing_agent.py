import json
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
from analyzer import analyze_errors
from patcher import generate_patch, validate_patch

# ── 상태 정의 ──────────────────────────────────────────────


class HealingState(TypedDict):
    target_file: str
    source_code: str
    fuzz_results: list[dict]
    analysis: dict
    patch_result: dict
    patch_valid: bool
    validation_msg: str
    retry_count: int


# ── 노드 정의 ──────────────────────────────────────────────


def node_analyze(state: HealingState) -> HealingState:
    print("\n[1/3] 에러 분석 중...")
    analysis = analyze_errors(state["fuzz_results"])
    print(f"  취약점: {analysis.get('vulnerability')} " f"(severity: {analysis.get('severity')})")
    print(f"  설명: {analysis.get('description')}")
    return {**state, "analysis": analysis}


def node_patch(state: HealingState) -> HealingState:
    print("\n[2/3] 패치 생성 중...")
    patch_result = generate_patch(state["source_code"], state["analysis"])
    print(f"  수정된 함수: {patch_result.get('functions_modified')}")
    if patch_result.get("diff"):
        print("\n--- diff ---")
        print(patch_result["diff"][:500])  # 처음 500자만 출력
        print("---")
    return {**state, "patch_result": patch_result}


def node_validate(state: HealingState) -> HealingState:
    print("\n[3/3] 패치 검증 중...")
    patch_code = state["patch_result"].get("patch_code", "")
    valid, msg = validate_patch(patch_code)
    print(f"  결과: {'통과' if valid else '실패'} — {msg}")
    return {**state, "patch_valid": valid, "validation_msg": msg}


def node_apply(state: HealingState) -> HealingState:
    """검증 통과시 실제 파일에 패치 적용"""
    patch_code = state["patch_result"]["patch_code"]
    target = state["target_file"]

    # 백업 먼저
    with open(target, "r") as f:
        original = f.read()
    with open(target + ".bak", "w") as f:
        f.write(original)

    # 패치 적용
    with open(target, "w") as f:
        f.write(patch_code)

    print(f"\n패치 적용 완료: {target}")
    print(f"백업: {target}.bak")
    return state


def node_retry(state: HealingState) -> HealingState:
    count = state.get("retry_count", 0) + 1
    print(f"\n재시도 {count}/2...")
    return {**state, "retry_count": count}


# ── 라우팅 ─────────────────────────────────────────────────


def route_after_validate(state: HealingState) -> str:
    if state["patch_valid"]:
        return "apply"
    if state.get("retry_count", 0) < 2:
        return "retry"
    return "end"  # 2번 재시도 후 포기


# ── 그래프 조립 ────────────────────────────────────────────


def build_graph():
    g = StateGraph(HealingState)

    g.add_node("analyze", node_analyze)
    g.add_node("patch", node_patch)
    g.add_node("validate", node_validate)
    g.add_node("apply", node_apply)
    g.add_node("retry", node_retry)

    g.set_entry_point("analyze")
    g.add_edge("analyze", "patch")
    g.add_edge("patch", "validate")
    g.add_conditional_edges(
        "validate",
        route_after_validate,
        {
            "apply": "apply",
            "retry": "patch",  # 검증 실패시 패치 재생성
            "end": END,
        },
    )
    g.add_edge("apply", END)
    g.add_edge("retry", "patch")

    return g.compile()


# ── 실행 ───────────────────────────────────────────────────

if __name__ == "__main__":
    # Week 1에서 얻은 퍼징 결과 그대로 사용
    fuzz_results = [
        {
            "payload": "{\"id\": \"1' OR '1'='1\"}",
            "status_code": 500,
            "response_time_ms": 2,
            "anomaly": True,
            "anomaly_type": "server_error",
        },
        {
            "payload": '{"id": "1; DROP TABLE users;--"}',
            "status_code": 500,
            "response_time_ms": 3,
            "anomaly": True,
            "anomaly_type": "server_error",
        },
        {
            "payload": '{"name": "\' UNION SELECT * FROM users--"}',
            "status_code": 400,
            "response_time_ms": 2,
            "anomaly": False,
        },
    ]

    with open("../target-server/main.go", "r") as f:
        source_code = f.read()

    graph = build_graph()

    result = graph.invoke(
        {
            "target_file": "../target-server/main.go",
            "source_code": source_code,
            "fuzz_results": fuzz_results,
            "analysis": {},
            "patch_result": {},
            "patch_valid": False,
            "validation_msg": "",
            "retry_count": 0,
        }
    )

    print("\n" + "=" * 50)
    print("자가 치유 완료!")
    print(f"취약점: {result['analysis'].get('vulnerability')}")
    print(f"패치 적용: {result['patch_valid']}")
