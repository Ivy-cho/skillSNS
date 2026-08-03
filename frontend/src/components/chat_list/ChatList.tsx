"use client";

import { useEffect, useState } from "react";
import { ChatListItem } from "./ChatListItem";
import { getChats } from "./chatData";
import type { Conversation } from "./types";

export function ChatList() {
  // null = 로딩 중, [] = 로드 완료(비어있음)와 구분한다.
  const [chats, setChats] = useState<Conversation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 마운트 시 대화 목록 로드 (지금은 목업, 백엔드 목록 API 생기면 getChats 내부만 교체).
  useEffect(() => {
    let cancelled = false;
    getChats()
      .then((data) => {
        if (!cancelled) setChats(data);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("대화 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface sm:h-[720px] sm:max-w-[390px] sm:rounded-[20px] sm:border sm:border-border sm:shadow-md">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4">
        <span className="text-base">💬</span>
        <span className="text-[0.95rem] font-bold text-ink">채팅 목록</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-bg p-3.5">
        {/* 에러 → 로딩 → 빈 상태 → 목록 순으로 구분해 렌더 */}
        {loadError ? (
          <p className="shrink-0 py-8 text-center text-[0.78rem] text-muted">
            {loadError}
          </p>
        ) : chats === null ? (
          <p className="shrink-0 py-8 text-center text-[0.78rem] text-muted">
            불러오는 중…
          </p>
        ) : chats.length === 0 ? (
          <p className="shrink-0 py-8 text-center text-[0.78rem] text-muted">
            아직 나눈 대화가 없어요.
          </p>
        ) : (
          chats.map((chat) => <ChatListItem key={chat.id} chat={chat} />)
        )}
      </div>
    </div>
  );
}
