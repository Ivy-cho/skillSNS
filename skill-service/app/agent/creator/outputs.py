from typing import Optional

from pydantic import BaseModel, Field


class WhatSkillOutput(BaseModel):
    """1단계(what-skill) 완료 시 호출. 스킬 주제/한 줄 정의/타겟을 확정한다."""

    topic: str = Field(description="스킬 주제. 무엇에 관한 스킬인지")
    definition: str = Field(description="한 줄 정의. 무엇을 도와주는지 한 문장")
    target: str = Field(description="타겟. 누구를 위한, 어떤 상황인지")


class SkillContentOutput(BaseModel):
    """2단계(skill-content) 완료 시 호출. 스킬의 알맹이를 확정한다. 없는 항목은 빈 문자열."""

    procedure: str = Field(default="", description="절차")
    rules: str = Field(default="", description="규칙")
    checklist: str = Field(default="", description="체크리스트")
    cases: str = Field(default="", description="사례")
    knowhow: str = Field(default="", description="노하우")
    safety: str = Field(default="", description="안전장치")
    tone: str = Field(default="", description="말투 (사용자가 정한 경우만)")


class SkillNameOutput(BaseModel):
    """3단계(skill-name) 완료 시 호출."""

    name: str = Field(description="사용자에게 보일 스킬 이름")


class SampleQuestion(BaseModel):
    question: str = Field(description="실제 사용자가 물어볼 법한 현실적인 질문")
    source: str = Field(description="'auto'(에이전트가 뽑음) 또는 'user'(사용자가 추가함)")


class DiagnosisItem(BaseModel):
    area: str = Field(description="절차 | 규칙 | 체크리스트 | 사례 | 노하우 | 안전장치 | 커버리지 | 말투")
    grade: int = Field(ge=1, le=5, description="5=매우 좋음 ... 1=없음")
    gradeLabel: str
    now: str = Field(description="지금 이 영역이 어떤 상태인지, 쉬운 말로")
    suggestion: str = Field(default="", description="grade 3 이하일 때만 채움")


class PassRate(BaseModel):
    withSkill: float
    withoutSkill: float
    help: str


class ResponseTime(BaseModel):
    seconds: float
    help: str


class AiCost(BaseModel):
    level: str = Field(description="적음 | 보통 | 많음")
    help: str


class Benchmark(BaseModel):
    passRate: PassRate
    time: ResponseTime
    aiCost: AiCost


class SkillTestOutput(BaseModel):
    """4단계(skill-test) 완료 시 호출. schemas/test_report.schema.json과 1:1 대응."""

    sampleQuestions: list[SampleQuestion]
    diagnosis: list[DiagnosisItem]
    benchmark: Benchmark
    analystNotes: list[str]


class SkillImproveOutput(BaseModel):
    """5단계(skill-improve) 완료 시 호출. 이번에 보완한 영역만 채우고 나머지는 None으로 둔다."""

    procedure: Optional[str] = None
    rules: Optional[str] = None
    checklist: Optional[str] = None
    cases: Optional[str] = None
    knowhow: Optional[str] = None
    safety: Optional[str] = None
    tone: Optional[str] = None
