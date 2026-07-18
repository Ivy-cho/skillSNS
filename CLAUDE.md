# skillSNS 프로젝트

## 개요
Agent 오케스트레이션 + Prompt 오케스트레이션을 활용한 **Skill SNS** MSA 서비스.
사용자가 자신의 스킬을 공유하고 연결되는 소셜 네트워크 플랫폼.

## 기술 스택
- **언어**: Python
- **아키텍처**: MSA (Microservices Architecture)
- **핵심 개념**: Agent 오케스트레이션, Prompt 오케스트레이션

## 서비스 구조

```
skillSNS/
├── user-service/     # 사용자 인증 및 프로필 관리
├── skill-service/    # 스킬 등록, 검색, 추천
└── feed-service/     # 피드 생성 및 소셜 인터랙션
```

## 서비스 역할

### user-service
- 회원가입 / 로그인 / 인증
- 사용자 프로필 관리
- 팔로우 / 팔로워 관계

### skill-service
- 스킬 등록 및 관리
- 스킬 검색 및 태깅
- Agent를 활용한 스킬 추천

### feed-service
- 팔로우 기반 피드 생성
- 게시물 / 댓글 / 좋아요
- Prompt 오케스트레이션 기반 콘텐츠 큐레이션

## 개발 규칙
- 각 서비스는 독립적으로 실행 가능해야 함
- 서비스 간 통신은 API로만 수행
- Python 코드는 ruff 포맷팅 기준 준수
