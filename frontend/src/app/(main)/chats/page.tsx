import { ChatList } from "@/components/chat_list/ChatList";

// 폰 프레임·하단 네비는 (main)/layout.tsx가 감싸주므로 여기선 내용만 렌더한다.
export default function ChatsPage() {
  return <ChatList />;
}
