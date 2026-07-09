import { type ReactNode } from "react";

/**
 * Minimal, dependency-free, XSS-safe Markdown → JSX. Renders headings, bold/italic,
 * inline code, safe links, blockquotes, rules, and bullet/numbered lists — enough to
 * turn Soumaya's structured research (and any Markdown memory) into a clean, scannable
 * report instead of a wall of text. No dangerouslySetInnerHTML: text is real React nodes.
 */

const INLINE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE.exec(rest))) {
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2] != null) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3] != null) out.push(<em key={key}>{m[3]}</em>);
    else if (m[4] != null) out.push(<code key={key}>{m[4]}</code>);
    else if (m[5] != null && m[6] != null)
      out.push(<a key={key} href={m[6]} target="_blank" rel="noopener noreferrer">{m[5]}</a>);
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push(rest);
  return out;
}

export function MarkdownView({ text, className }: { text: string; className?: string }) {
  const lines = (text || "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const key = `p${blocks.length}`;
      blocks.push(<p key={key}>{inline(para.join(" "), key)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (!list) return;
    const L = list;
    const key = `l${blocks.length}`;
    const items = L.items.map((it, ix) => <li key={ix}>{inline(it, `${key}-${ix}`)}</li>);
    blocks.push(L.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const key = `h${blocks.length}`;
      const content = inline(h[2]!, key);
      const lvl = h[1]!.length;
      blocks.push(lvl === 1 ? <h3 key={key}>{content}</h3> : lvl === 2 ? <h4 key={key}>{content}</h4> : <h5 key={key}>{content}</h5>);
      continue;
    }
    if (/^([-*_]){3,}$/.test(line.replace(/\s/g, ""))) {
      flushPara();
      flushList();
      blocks.push(<hr key={`hr${blocks.length}`} />);
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul ? ul[1] : ol![1])!);
      continue;
    }
    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) {
      flushPara();
      flushList();
      const key = `bq${blocks.length}`;
      blocks.push(<blockquote key={key}>{inline(bq[1]!, key)}</blockquote>);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();

  return <div className={className}>{blocks}</div>;
}
