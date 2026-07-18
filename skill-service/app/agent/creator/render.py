def render_md_content(skill_info: dict) -> str:
    """확정 시 skill_info(content 등 구조화된 필드)를 실제 채팅 에이전트의 시스템 프롬프트로
    쓸 하나의 마크다운 문자열로 조립한다. skill_info.schema.json의 content.* 필드 이름과 그대로 맞춘다."""

    name = skill_info.get("name") or "전문가"
    definition = skill_info.get("definition") or ""
    target = skill_info.get("target") or ""
    content = skill_info.get("content") or {}

    sections = [
        ("절차", content.get("procedure")),
        ("규칙", content.get("rules")),
        ("체크리스트", content.get("checklist")),
        ("사례", content.get("cases")),
        ("노하우", content.get("knowhow")),
        ("안전장치", content.get("safety")),
        ("말투", content.get("tone")),
    ]

    lines = [f"# {name}", ""]
    if definition:
        lines += [definition, ""]
    if target:
        lines += [f"**대상:** {target}", ""]
    for title, body in sections:
        if body:
            lines += [f"## {title}", body, ""]

    return "\n".join(lines).strip()
