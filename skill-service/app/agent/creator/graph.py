from langgraph.graph import END, START, StateGraph

from .merges import merge_content, merge_improve, merge_what_skill
from .name_node import make_name_node
from .outputs import SkillContentOutput, SkillImproveOutput, WhatSkillOutput
from .stage_runner import make_stage_node
from .state import CreatorState
from .test_node import make_skill_test_node

# stage 이름 -> (프롬프트 파일, 출력 tool 스키마, skill_info 병합 함수, 완료 시 state.stage에
# 기록할 다음 stage 이름). 어떤 단계도 완료 즉시 다음 노드로 자동으로 이어가지 않는다 —
# 호출 하나가 항상 단계 하나에만 대응하고, 다음 단계로 넘어갈지는 클라이언트가 다음 요청을
# 언제 보내느냐로 결정한다. 그 다음 요청이 오면 START가 이미 갱신된 state["stage"]를 보고
# 알아서 그 노드로 들어간다(아래 route_by_current_stage).
#
# skill_name과 skill_test는 공용 실행기로 못 만드는 예외라 이 표에는 없고 아래에서 각각
# 별도 노드(name_node.py / test_node.py)로 등록한다.
STAGES = {
    "what_skill": ("01-what-skill.md", WhatSkillOutput, merge_what_skill, "skill_content"),
    "skill_content": ("02-skill-content.md", SkillContentOutput, merge_content, "skill_name"),
    "skill_improve": ("05-skill-improve.md", SkillImproveOutput, merge_improve, None),
}


def route_by_current_stage(state: CreatorState) -> str:
    """모든 호출은 START에서 시작해 state['stage']가 가리키는 노드로 바로 진입한다.
    LangGraph는 매 invoke를 항상 START부터 실행하므로, 이 라우팅이 없으면 매번
    01(what_skill)부터 다시 돌게 된다."""
    return state["stage"]


def build_creator_graph(checkpointer, api_key: str):
    builder = StateGraph(CreatorState)

    for stage_name, (prompt_file, output_model, merge, next_stage) in STAGES.items():
        builder.add_node(
            stage_name, make_stage_node(prompt_file, output_model, merge, next_stage, api_key)
        )
        builder.add_edge(stage_name, END)

    # skill_name: 이름 후보(choices)를 확정 전에도 구조화해서 보여줄 수 있어야 해서 전용 노드.
    builder.add_node("skill_name", make_name_node("skill_test", api_key))
    builder.add_edge("skill_name", END)

    # skill_test: 자체 오케스트레이션이 필요해 stage_runner가 아니라 test_node.py로 만든다.
    builder.add_node("skill_test", make_skill_test_node(api_key))
    builder.add_edge("skill_test", END)

    all_stage_names = [*STAGES.keys(), "skill_name", "skill_test"]
    builder.add_conditional_edges(START, route_by_current_stage, {name: name for name in all_stage_names})

    return builder.compile(checkpointer=checkpointer)
