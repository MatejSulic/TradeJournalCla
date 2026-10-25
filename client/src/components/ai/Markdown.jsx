import { memo } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const TRADE_REF = /#(\d+)/g;
const SKIP = new Set(['code', 'inlineCode', 'link', 'linkReference', 'definition', 'html']);

/** remark plugin: `#123` in plain text → link node to /trades/123 (marked so `a` renders a router Link). */
function remarkTradeLinks() {
  const walk = (node) => {
    if (!node.children || SKIP.has(node.type)) return;
    const out = [];
    for (const child of node.children) {
      if (child.type !== 'text') { walk(child); out.push(child); continue; }
      const value = child.value;
      let last = 0;
      for (const m of value.matchAll(TRADE_REF)) {
        if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
        out.push({
          type: 'link',
          url: `/trades/${m[1]}`,
          data: { hProperties: { 'data-trade-ref': m[1] } },
          children: [{ type: 'text', value: `#${m[1]}` }],
        });
        last = m.index + m[0].length;
      }
      if (last === 0) out.push(child);
      else if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
    }
    node.children = out;
  };
  return (tree) => walk(tree);
}

const REMARK = [remarkGfm, remarkTradeLinks];

const COMPONENTS = {
  a({ node, href, children, ...rest }) {
    if (rest['data-trade-ref']) {
      return <Link to={`/trades/${rest['data-trade-ref']}`} className="text-accent font-medium">{children}</Link>;
    }
    return <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">{children}</a>;
  },
  h1: ({ node, ...p }) => <h3 className="mt-4 mb-2 first:mt-0 text-base font-semibold text-slate-900 dark:text-white" {...p} />,
  h2: ({ node, ...p }) => <h3 className="mt-4 mb-2 first:mt-0 text-base font-semibold text-slate-900 dark:text-white" {...p} />,
  h3: ({ node, ...p }) => <h4 className="mt-3 mb-1.5 first:mt-0 text-sm font-semibold text-slate-900 dark:text-white" {...p} />,
  h4: ({ node, ...p }) => <h5 className="mt-3 mb-1 first:mt-0 text-sm font-semibold text-slate-800 dark:text-slate-100" {...p} />,
  p: ({ node, ...p }) => <p className="my-2 first:mt-0 last:mb-0" {...p} />,
  ul: ({ node, ...p }) => <ul className="my-2 first:mt-0 last:mb-0 pl-5 list-disc space-y-1 marker:text-slate-400 dark:marker:text-slate-500" {...p} />,
  ol: ({ node, ...p }) => <ol className="my-2 first:mt-0 last:mb-0 pl-5 list-decimal space-y-1 marker:text-slate-400 dark:marker:text-slate-500" {...p} />,
  li: ({ node, ...p }) => <li className="pl-0.5" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-slate-900 dark:text-white" {...p} />,
  blockquote: ({ node, ...p }) => <blockquote className="my-2 pl-3 border-l-2 border-surface-border text-slate-500 dark:text-slate-400" {...p} />,
  hr: () => <hr className="my-4 border-surface-border" />,
  code({ node, className, children, ...p }) {
    // Fenced blocks get a language-* class or contain newlines; everything else is inline
    const block = /language-/.test(className || '') || String(children).includes('\n');
    if (block) return <code className="font-mono text-[0.8rem]" {...p}>{children}</code>;
    return <code className="px-1.5 py-0.5 rounded-md bg-surface-raised font-mono text-[0.8rem] text-slate-800 dark:text-slate-100" {...p}>{children}</code>;
  },
  pre: ({ node, ...p }) => <pre className="my-2 p-3 rounded-xl bg-surface-raised overflow-x-auto leading-relaxed" {...p} />,
  table: ({ node, ...p }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full text-xs tabular-nums border-collapse" {...p} />
    </div>
  ),
  thead: ({ node, ...p }) => <thead className="bg-surface-raised" {...p} />,
  th: ({ node, style, ...p }) => <th style={style} className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap" {...p} />,
  td: ({ node, style, ...p }) => <td style={style} className="px-3 py-2 border-t border-surface-border align-top" {...p} />,
};

/** Assistant answer: GitHub-flavoured markdown styled with theme tokens; `#123` links to the trade. */
function Markdown({ text }) {
  return (
    <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 break-words">
      <ReactMarkdown remarkPlugins={REMARK} components={COMPONENTS}>{text || ''}</ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
