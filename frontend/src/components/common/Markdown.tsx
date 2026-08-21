import { Fragment, type ReactNode } from "react";

// 에이전트 답변에 섞여 오는 마크다운을 실제 서식으로 그린다.
// 라이브러리를 쓰지 않는 이유: 실제로 오는 건 제목·목록·표·구분선·볼드·인라인코드
// 정도라서 이 정도면 충분하고, 말풍선 안에서 쓰는 만큼 서식 크기를 앱 디자인에
// 직접 맞추는 편이 낫다.

// ---- 인라인: **볼드**, `코드` ----
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2) {
      return (
        <code
          key={i}
          className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] text-ink"
        >
          {seg.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{seg}</Fragment>;
  });
}

const isTableRow = (line: string) => line.trim().startsWith("|");
// |---|:--:|---| 처럼 칸 구분만 있는 줄 (표의 머리/몸통 경계)
const isTableDivider = (line: string) => /^\|[\s:|-]+\|?$/.test(line.trim());
const cellsOf = (line: string) =>
  line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

const BULLET = /^[-*+]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 빈 줄 → 문단 사이 여백
    if (trimmed === "") {
      blocks.push(<div key={i} className="h-2" />);
      i += 1;
      continue;
    }

    // 구분선
    if (RULE.test(trimmed)) {
      blocks.push(<hr key={i} className="my-2 border-border" />);
      i += 1;
      continue;
    }

    // 제목 — 말풍선 안이라 h1도 과하지 않게 억제한다
    const heading = trimmed.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      const size = level === 1 ? "text-[1.02em]" : level === 2 ? "text-[0.98em]" : "text-[0.94em]";
      blocks.push(
        <div key={i} className={`mt-1 mb-0.5 font-bold text-ink ${size}`}>
          {renderInline(heading[2])}
        </div>,
      );
      i += 1;
      continue;
    }

    // 인용문 — 연속된 "> " 줄을 묶어, 인용 표시를 뗀 내용을 그대로 다시 그린다.
    // (인용 안에도 목록·볼드가 섞여 온다)
    if (/^>\s?/.test(trimmed)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoted.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <div key={`q${i}`} className="my-1 border-l-2 border-primary/40 pl-3">
          <Markdown text={quoted.join("\n")} />
        </div>,
      );
      continue;
    }

    // 표 — 좁은 화면에서 말풍선을 밀지 않도록 표만 가로 스크롤한다
    if (isTableRow(line)) {
      const rows: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(lines[i]);
        i += 1;
      }
      const body = rows.filter((r) => !isTableDivider(r));
      const [head, ...rest] = body;
      blocks.push(
        <div key={`t${i}`} className="my-1.5 overflow-x-auto">
          <table className="w-full border-collapse text-[0.92em]">
            <thead>
              <tr>
                {cellsOf(head).map((c, j) => (
                  <th
                    key={j}
                    className="border border-border bg-surface-2 px-2 py-1 text-left font-semibold text-ink"
                  >
                    {renderInline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rest.map((row, r) => (
                <tr key={r}>
                  {cellsOf(row).map((c, j) => (
                    <td key={j} className="border border-border px-2 py-1 align-top">
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // 목록 — 연속된 줄을 하나로 묶는다
    const listMatch = (l: string) => l.trim().match(BULLET) ?? l.trim().match(NUMBERED);
    if (listMatch(line)) {
      const numbered = NUMBERED.test(trimmed);
      const items: string[] = [];
      while (i < lines.length && listMatch(lines[i])) {
        items.push(listMatch(lines[i])![1]);
        i += 1;
      }
      const ListTag = numbered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={`l${i}`}
          className={`my-0.5 ml-4 space-y-0.5 ${numbered ? "list-decimal" : "list-disc"}`}
        >
          {items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // 그 밖엔 한 줄 문단
    blocks.push(<div key={i}>{renderInline(line)}</div>);
    i += 1;
  }

  return <>{blocks}</>;
}
