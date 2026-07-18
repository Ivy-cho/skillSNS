def extract_text(content) -> str:
    """LangChain 메시지의 content는 문자열이거나, {"type": "text", "text": ...} 블록들의
    리스트일 수 있다. 화면에 보여줄 순수 텍스트만 뽑아낸다."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    return str(content) if content else ""
