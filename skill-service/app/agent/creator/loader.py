import re
from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts" / "skill_creation"

# .md 안의 {변수}를 skill_info의 어떤 필드로 치환할지 매핑.
# 프롬프트 엔지니어가 .md에 새 변수를 쓰려면 여기 한 줄만 추가하면 된다 (코드의 다른 곳은 건드릴 필요 없음).
VARIABLE_MAP = {
    "카테고리": "category",
    "스킬 주제": "topic",
    "타겟": "target",
}


@lru_cache(maxsize=None)
def _read_template(filename: str) -> str:
    return (PROMPTS_DIR / filename).read_text(encoding="utf-8")


def load_prompt(filename: str, skill_info: dict) -> str:
    template = _read_template(filename)

    def replace(match: re.Match) -> str:
        field = VARIABLE_MAP.get(match.group(1))
        value = skill_info.get(field) if field else None
        return value if value else match.group(0)

    return re.sub(r"\{([^{}]+)\}", replace, template)
