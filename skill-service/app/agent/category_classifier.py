from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.creator.loader import load_prompt
from app.core.config import settings
from app.services.categories import get_taxonomy_tree, upsert_category


class CategoryDecision(BaseModel):
    """카테고리명 Agent의 출력. 대분류/소분류를 각각 이름·이모지·신규여부로 넘긴다.
    (신규 여부는 판단 근거일 뿐이고, 실제 저장은 upsert가 이름으로 재조회해 중복을 막는다.)"""

    major_name: str = Field(description="대분류 이름. 기존 목록에 맞는 게 있으면 그 이름을 그대로 쓴다.")
    major_emoji: str = Field(description="대분류를 대표하는 이모지 1개")
    major_is_new: bool = Field(description="대분류를 새로 만든 것이면 true")
    sub_name: str = Field(description="소분류 이름. 기존 목록에 맞는 게 있으면 그 이름을 그대로 쓴다.")
    sub_emoji: str = Field(description="소분류를 대표하는 이모지 1개 (스킬 카드/아바타에 표시됨)")
    sub_is_new: bool = Field(description="소분류를 새로 만든 것이면 true")


async def classify_category(
    material: str,
    api_key: str,
    db: AsyncSession,
    *,
    topic: str = "",
    definition: str = "",
    target: str = "",
) -> str:
    """완성된 스킬의 내용(material)을 보고 대/소분류를 정해 categories에 upsert하고 소분류 id를
    돌려준다. 사용자와 대화하지 않는 일회성 분류 호출이다(카테고리명 Agent). 스킬 생성 흐름과
    '내 스킬 넣기' 직접 생성 경로가 함께 쓰므로, 스킬 구조가 아니라 내용 텍스트를 입력으로 받는다."""
    taxonomy = await get_taxonomy_tree(db)
    prompt_vars = {"topic": topic, "definition": definition, "target": target, "_taxonomy": taxonomy}
    system = SystemMessage(content=load_prompt("06-category.md", prompt_vars))
    human = HumanMessage(content=material or "(내용 없음)")

    llm = ChatAnthropic(model=settings.ANTHROPIC_MODEL, api_key=api_key)
    llm_with_tool = llm.bind_tools([CategoryDecision], tool_choice="CategoryDecision")
    response = await llm_with_tool.ainvoke([system, human])

    tool_calls = getattr(response, "tool_calls", None)
    if not tool_calls:
        raise RuntimeError("카테고리 분류가 결과를 반환하지 않았습니다")

    args = tool_calls[0]["args"]
    return await upsert_category(
        db,
        major_name=args.get("major_name"),
        major_emoji=args.get("major_emoji"),
        sub_name=args.get("sub_name"),
        sub_emoji=args.get("sub_emoji"),
    )
