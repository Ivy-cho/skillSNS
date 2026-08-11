"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

const REVEAL = 84; // 삭제 버튼이 드러나는 폭(px)
const OPEN_AT = 40; // 이만큼 이상 밀면 열린 채로 고정
const DRAG_SLOP = 6; // 이 이하 움직임은 탭으로 본다 (스와이프 중 링크 이동 방지)

// 왼쪽으로 밀면 뒤에서 "삭제"가 드러나는 목록 항목.
// 터치·마우스 모두 pointer 이벤트 하나로 처리한다.
export function SwipeableSkillItem({
  href,
  onDelete,
  deleting,
  children,
}: {
  href: string;
  onDelete: () => void;
  deleting: boolean;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  // 드래그 여부는 ref로 판단한다 — state로 하면 pointerdown 직후 같은 틱에 오는 pointermove가
  // 아직 반영 안 된 값을 보고 무시된다. state(dragging)는 transition을 끄는 용도로만 쓴다.
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const openRef = useRef(false);
  const dxRef = useRef(0);
  const moved = useRef(0);

  function onPointerDown(e: React.PointerEvent) {
    draggingRef.current = true;
    setDragging(true);
    moved.current = 0;
    startX.current = e.clientX;
    // 포인터를 이 요소에 붙잡아 둔다 — 카드 밖으로 끌어도 move/up을 계속 받는다.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const delta = e.clientX - startX.current + (openRef.current ? -REVEAL : 0);
    moved.current = Math.max(moved.current, Math.abs(e.clientX - startX.current));
    // 왼쪽으로만(음수), REVEAL까지만 민다.
    const next = Math.max(-REVEAL, Math.min(0, delta));
    dxRef.current = next;
    setDx(next);
  }

  function onPointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const shouldOpen = dxRef.current <= -OPEN_AT;
    openRef.current = shouldOpen;
    dxRef.current = shouldOpen ? -REVEAL : 0;
    setDx(dxRef.current);
  }

  function close() {
    openRef.current = false;
    dxRef.current = 0;
    setDx(0);
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl">
      {/* 뒤에 깔린 삭제 버튼 — 터치에선 왼쪽으로 밀면 드러나고, 마우스에선 카드에 올리면 보인다. */}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="이 스킬 삭제"
        className="absolute inset-y-0 right-0 flex w-[84px] items-center justify-center bg-error text-[0.82rem] font-semibold text-white disabled:opacity-60"
      >
        {deleting ? "삭제 중" : "삭제"}
      </button>

      {/* 앞에서 밀리는 카드 */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateX(${dx}px)`,
          // 세로 스크롤은 브라우저에 맡기고 가로 제스처는 우리가 처리한다 (뒤로가기 제스처 방지).
          touchAction: "pan-y",
          // 끄는 동안 글자가 선택되지 않게.
          userSelect: dragging ? "none" : undefined,
        }}
        // 마우스가 있는 기기에선 항목에 올리기만 해도 밀려서 삭제가 드러난다(끌지 않아도 되게).
        // 카드가 아니라 바깥 래퍼(group) 기준이라, 밀린 뒤 포인터가 삭제 버튼 위에 있어도
        // 계속 열려 있다 — 카드 기준으로 하면 열렸다 닫혔다 깜빡인다.
        // 손으로 밀어 둔 상태(dx≠0)면 그 값이 우선.
        className={`relative bg-surface ${
          dragging ? "" : "transition-transform duration-200"
        } ${dx === 0 ? "group-hover:-translate-x-[84px]" : ""} motion-reduce:transition-none`}
      >
        <Link
          href={href}
          // 미는 동작이었으면 링크 이동을 막는다.
          onClick={(e) => {
            if (moved.current > DRAG_SLOP || openRef.current) {
              e.preventDefault();
              if (openRef.current) close();
            }
          }}
          className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3"
        >
          {children}
        </Link>
      </div>
    </div>
  );
}
