// 채팅(대화) 목록 화면 데이터 타입. React 의존성 없음.

export type Conversation = {
  id: string; // 대상 스킬 id
  sessionId: string; // 이 줄이 가리키는 '그 대화'. 한 스킬에 대화가 여러 개일 수 있다
  skillName: string; // 스킬명
  avatar: string; // 아바타에 넣을 이모지/이니셜
  summary: string; // 어떤 대화를 나눴는지 요약
  lastMessage: string; // 마지막으로 오간 말
  timeLabel: string; // 마지막 대화 시각 (예: "어제", "3일 전")
};
