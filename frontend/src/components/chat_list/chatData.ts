// 채팅 목록 목업 데이터 + 접근자.
// 백엔드에 "내 대화 목록"을 주는 엔드포인트가 아직 없다 (채팅 라우트는 시작/이어가기/단일 히스토리뿐).
// 그런 API가 생기면 getChats() 본문만 실호출로 교체하면 된다 — 이 파일이 유일한 스왑 포인트.
// 스킬명은 실제 스킬과 맞췄지만, 요약·마지막 말·시각은 백엔드에 없는 값이라 목업이다.

import type { Conversation } from "./types";

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "mock-interior-1",
    skillName: "좁은 집 가구 배치법",
    avatar: "🛋️",
    summary: "7평 원룸 침대·책상 배치를 상담했어요",
    lastMessage: "문에서 가장 먼 안쪽 벽에 두면 넓어 보여요 🪟",
    timeLabel: "방금",
  },
  {
    id: "mock-career-1",
    skillName: "붙는 자소서 첨삭법",
    avatar: "💼",
    summary: "이직 자기소개서를 함께 다듬었어요",
    lastMessage: "성과는 '얼마나 바꿨다'로 써야 눈에 들어와요.",
    timeLabel: "어제",
  },
  {
    id: "mock-finance-1",
    skillName: "월급쟁이 첫 투자 시작하기",
    avatar: "💰",
    summary: "비상금과 첫 투자 순서를 물어봤어요",
    lastMessage: "비상금 3개월치를 먼저 만들고 시작해요.",
    timeLabel: "3일 전",
  },
  {
    id: "mock-writing-1",
    skillName: "클릭되는 한 줄 카피 쓰기",
    avatar: "✍️",
    summary: "블로그 글 제목을 살리는 법을 배웠어요",
    lastMessage: "숫자랑 구체적 상황을 넣어보세요.",
    timeLabel: "1주 전",
  },
  {
    id: "mock-custom-1",
    skillName: "뭘 해도 네 편인 고민상담",
    avatar: "💛",
    summary: "요즘 지친 마음을 털어놨어요",
    lastMessage: "많이 지쳤겠다. 어떤 일부터 얘기해볼까?",
    timeLabel: "2주 전",
  },
];

// 대화 목록. 지금은 목업을 반환한다.
// 백엔드에 목록 API가 생기면 이 함수 본문만 실호출로 교체하면 된다.
export async function getChats(): Promise<Conversation[]> {
  return MOCK_CONVERSATIONS;
}
