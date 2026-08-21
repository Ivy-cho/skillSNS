"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

const ACTION_W = 72; // 뒤에 깔린 버튼 하나의 폭(px)
const OPEN_AT = 40; // 이만큼 이상 밀면 열린 채로 고정
const DRAG_SLOP = 6; // 이 이하 움직임은 탭으로 본다 (스와이프 중 링크/버튼 오작동 방지)

export type SwipeAction = {
  label: string;
  /** 누르면 실행할 동작. href와 둘 중 하나만 준다. */
  onClick?: () => void;
  /** 누르면 이동할 곳. onClick과 둘 중 하나만 준다. */
  href?: string;
  tone: "primary" | "danger";
  disabled?: boolean;
};

// 왼쪽으로 끌면 뒤에서 버튼들이 드러나는 목록 행.
// 터치는 스와이프, 마우스는 클릭한 채로 드래그 — pointer 이벤트 하나로 둘 다 처리한다.
// (호버로 자동 노출하지 않는다: 마우스를 올리는 것만으로 열리면 드래그할 틈이 없다.)
export function SwipeableRow({
  actions,
  children,
}: {
  actions: SwipeAction[];
  children: ReactNode;
}) {
  const reveal = ACTION_W * actions.length;

  const [dx, setDx] = useState(0);
  // 드래그 여부는 ref로 판단한다 — state로 하면 pointerdown 직후 같은 틱에 오는 pointermove가
  // 아직 반영 안 된 값을 보고 무시된다. state(dragging)는 transition을 끄는 용도로만 쓴다.
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const openRef = useRef(false);
  const dxRef = useRef(0);
  const moved = useRef(0);
  const captured = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 끌던 중이 아니면서 밀려 있으면 = 뒤 버튼이 드러난 상태.
  const isOpen = !dragging && dx < 0;

  function close() {
    openRef.current = false;
    dxRef.current = 0;
    setDx(0);
  }

  function onPointerDown(e: React.PointerEvent) {
    draggingRef.current = true;
    setDragging(true);
    moved.current = 0;
    startX.current = e.clientX;
    captured.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const delta = e.clientX - startX.current + (openRef.current ? -reveal : 0);
    moved.current = Math.max(moved.current, Math.abs(e.clientX - startX.current));
    // 캡처는 "끌기가 시작된 뒤"에만 건다. 누르자마자 캡처하면 이어지는 click 이벤트가
    // 안쪽 내용이 아니라 캡처한 이 div로 가버려서, 그냥 눌렀을 때 아무 일도 일어나지 않는다.
    if (!captured.current && moved.current > DRAG_SLOP) {
      captured.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    // 왼쪽으로만(음수), reveal까지만 민다.
    const next = Math.max(-reveal, Math.min(0, delta));
    dxRef.current = next;
    setDx(next);
  }

  function onPointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const shouldOpen = dxRef.current <= -OPEN_AT;
    openRef.current = shouldOpen;
    dxRef.current = shouldOpen ? -reveal : 0;
    setDx(dxRef.current);
  }

  // 열린 채로 행 바깥을 누르면 닫는다. 행 안(본문·액션 버튼)은 각자의 핸들러가 처리한다.
  // 이게 없으면 한 번 열린 행은 다시 스와이프해야만 닫혔다.
  useEffect(() => {
    if (!isOpen) return;
    function onDocPointerDown(e: PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      openRef.current = false;
      dxRef.current = 0;
      setDx(0);
    }
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative overflow-hidden rounded-2xl">
      {/* 뒤에 깔린 버튼들 — 행을 왼쪽으로 끌면 드러난다.
          되돌릴 수 없는 동작을 가장 바깥(오른쪽 끝)에 두도록 호출부에서 순서를 정한다. */}
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((action) => {
          const cls = `flex items-center justify-center text-[0.82rem] font-semibold text-white ${
            action.tone === "danger" ? "bg-error" : "bg-primary"
          }`;
          return action.href ? (
            <Link
              key={action.label}
              href={action.href}
              style={{ width: ACTION_W }}
              className={cls}
            >
              {action.label}
            </Link>
          ) : (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              style={{ width: ACTION_W }}
              className={`${cls} disabled:opacity-60`}
            >
              {action.label}
            </button>
          );
        })}
      </div>

      {/* 앞에서 밀리는 내용 */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // 링크·이미지는 브라우저가 기본으로 "끌어서 옮기기"(네이티브 드래그)를 시작한다.
        // 그러면 pointermove가 끊겨 밀리지 않으므로, 안쪽에서 올라오는 dragstart를 막는다.
        onDragStart={(e) => e.preventDefault()}
        // 캡처 단계라 안쪽 핸들러보다 먼저 돈다.
        onClickCapture={(e) => {
          const wasDrag = moved.current > DRAG_SLOP;
          if (!wasDrag && !openRef.current) return; // 평범한 클릭 — 안쪽으로 통과시킨다
          e.preventDefault();
          e.stopPropagation();
          // 끌기가 끝나면 브라우저가 click을 하나 더 쏜다. 그건 제스처의 꼬리일 뿐이라
          // 삼키기만 한다 — 닫기로 처리하면 손을 떼는 순간 방금 연 행이 도로 닫힌다.
          if (!wasDrag) close();
        }}
        style={{
          transform: `translateX(${dx}px)`,
          // 세로 스크롤은 브라우저에 맡기고 가로 제스처는 우리가 처리한다 (뒤로가기 제스처 방지).
          touchAction: "pan-y",
        }}
        className={`relative select-none bg-surface ${
          dragging ? "cursor-grabbing" : "cursor-grab transition-transform duration-200"
        } motion-reduce:transition-none`}
      >
        {children}
      </div>
    </div>
  );
}
