from typing import Optional

from langgraph.graph import MessagesState


class CreatorState(MessagesState):
    """skill_info: workflows 단계를 지나며 누적되는 스킬 정보 (skill_info.schema.json과 동일한 모양).
    stage: 지금 어느 노드에 있는지. START는 이 값을 보고 바로 그 노드로 진입한다.

    turn_messages/choices/summary: 누적이 아니라 "이번 턴에 새로 나온 값"으로 매번 덮어써진다.
    모든 노드가 매 호출마다 이 셋을 반드시 채워서 반환하므로 이전 턴 값이 남아있을 일은 없다."""

    skill_info: dict
    stage: str
    turn_messages: list[str]
    choices: Optional[list[str]]
    summary: bool
