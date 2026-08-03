"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 하단 탭 아이콘 — 외부 아이콘 라이브러리 없이 인라인 SVG(24px, stroke=currentColor)로 둔다.
// 활성/비활성 색은 currentColor로 상위 링크에서 제어한다.
function FeedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <path d="M3 15h18M3 19h12" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z" />
      <path d="M9.5 20.5V14h5v6.5" />
    </svg>
  );
}

const TABS = [
  { href: "/feed", label: "피드", Icon: FeedIcon },
  { href: "/chats", label: "채팅 목록", Icon: ChatIcon },
  { href: "/home", label: "홈", Icon: HomeIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      className="flex shrink-0 items-stretch border-t border-border bg-surface"
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            // 라벨 텍스트를 화면에 노출하지 않으므로(아이콘 전용) 이름은 aria-label로 준다.
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 items-center justify-center py-3.5 transition-transform active:scale-[0.97] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              active ? "text-primary" : "text-muted"
            }`}
          >
            <Icon />
          </Link>
        );
      })}
    </nav>
  );
}
