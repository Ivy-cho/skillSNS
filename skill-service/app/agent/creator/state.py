from langgraph.graph import MessagesState


class CreatorState(MessagesState):
    """skill_info: workflows 단계를 지나며 누적되는 스킬 정보 (skill_info.schema.json과 동일한 모양).
    stage: 지금 어느 노드에 있는지. START는 이 값을 보고 바로 그 노드로 진입한다."""

    skill_info: dict
    stage: str
