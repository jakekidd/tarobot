// A deliberately tiny markdown renderer for the editor's PREVIEW view.
//
// Just enough to make a persona prompt readable while editing: headings,
// bold/italic, inline code, bullet/numbered lists, horizontal rules,
// blockquotes, paragraphs. No tables, no links, no nested lists, no HTML
// passthrough. Builds React elements directly — never dangerouslySetInnerHTML.

import type { ReactNode } from 'react';

const INLINE = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={`${key}-${i}`}>{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<code key={`${key}-${i}`}>{m[3]}</code>);
    else if (m[4] !== undefined) out.push(<em key={`${key}-${i}`}>{m[4]}</em>);
    else if (m[5] !== undefined) out.push(<em key={`${key}-${i}`}>{m[5]}</em>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((t, k) => <li key={k}>{inline(t, `li-${key}-${k}`)}</li>);
    blocks.push(list.ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
    list = null;
  };
  const flushPara = () => {
    if (para.length === 0) return;
    const k = key++;
    blocks.push(
      <p key={k}>
        {para.map((line, idx) => (
          <span key={idx}>
            {idx > 0 && <br />}
            {inline(line, `p-${k}-${idx}`)}
          </span>
        ))}
      </p>,
    );
    para = [];
  };
  const flushAll = () => { flushList(); flushPara(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') { flushAll(); continue; }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1]!.length;
      const Tag = `h${Math.min(level + 1, 6)}` as 'h2';
      blocks.push(<Tag key={key++}>{inline(heading[2]!, `h-${key}`)}</Tag>);
      continue;
    }

    if (/^(---|___|\*\*\*)\s*$/.test(line)) { flushAll(); blocks.push(<hr key={key++} />); continue; }

    if (line.startsWith('>')) {
      flushList();
      para.push(line.replace(/^>\s?/, ''));
      continue;
    }

    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      const text = (ul ? ul[1] : ol![1])!;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(text);
      continue;
    }

    flushList();
    para.push(line);
  }
  flushAll();

  return <div className="pst-md">{blocks}</div>;
}
