from langgraph.graph import END, START, StateGraph

from .merges import merge_content, merge_improve, merge_name, merge_what_skill
from .outputs import SkillContentOutput, SkillImproveOutput, SkillNameOutput, WhatSkillOutput
from .stage_runner import make_router, make_stage_node
from .state import CreatorState
from .test_node import make_skill_test_node

# stage 이름 -> (프롬프트 파일, 출력 tool 스키마, skill_info 병합 함수, 완료 시 자동으로 이어갈 다음 stage)
#
# what_skill -> skill_content -> skill_name은 각 단계가 끝나자마자 같은 턴에서 바로 다음 단계로
# 이어진다(다음 단계의 "시작 문구"가 곧바로 이어 붙는 이유). skill_name이 끝나면 skill_test로
# 넘어가지만, skill_test는 공용 실행기로 못 만드는 유일한 예외라 이 표에는 없고 아래에서
# 별도 노드(test_node.py)로 등록한다.
#
# skill_improve는 next_stage가 None이다. 05에서 개선이 끝나도 04로 자동으로 돌아가지 않는다
# — 사용자가 결과를 보고 "다시 테스트할지" / "이대로 확정할지"를 직접 고르는 지점이기 때문이다.
# 그 선택에 따른 전환은 이 그래프의 배선이 아니라, API 라우트가 SkillDraft.stage 값을 바꿔서
# 다음 호출 때 START가 그 단계로 바로 들어오게 하는 방식으로 처리한다. skill_test도 마찬가지다.
STAGES = {
    "what_skill": ("01-what-skill.md", WhatSkillOutput, merge_what_skill, "skill_content"),
    "skill_content": ("02-skill-content.md", SkillContentOutput, merge_content, "skill_name"),
    "skill_name": ("03-skill-name.md", SkillNameOutput, merge_name, "skill_test"),
    "skill_improve": ("05-skill-improve.md", SkillImproveOutput, merge_improve, None),
}


def route_by_current_stage(state: CreatorState) -> str:
    """모든 호출은 START에서 시작해 state['stage']가 가리키는 노드로 바로 진입한다.
    LangGraph는 매 invoke를 항상 START부터 실행하므로, 이 라우팅이 없으면 매번
    01(what_skill)부터 다시 돌게 된다."""
    return state["stage"]


def build_creator_graph(checkpointer):
    builder = StateGraph(CreatorState)

    for stage_name, (prompt_file, output_model, merge, next_stage) in STAGES.items():
        builder.add_node(stage_name, make_stage_node(prompt_file, output_model, merge, next_stage))
        edges = {END: END}
        if next_stage:
            edges[next_stage] = next_stage
        builder.add_conditional_edges(stage_name, make_router(next_stage), edges)

    # skill_test: 자체 오케스트레이션이 필요해 stage_runner가 아니라 test_node.py로 만든다.
    # 완료돼도 자동으로 다음 단계로 넘어가지 않는 건 skill_improve와 동일하다.
    builder.add_node("skill_test", make_skill_test_node())
    builder.add_conditional_edges("skill_test", make_router(None), {END: END})

    all_stage_names = [*STAGES.keys(), "skill_test"]
    builder.add_conditional_edges(START, route_by_current_stage, {name: name for name in all_stage_names})

    return builder.compile(checkpointer=checkpointer)
