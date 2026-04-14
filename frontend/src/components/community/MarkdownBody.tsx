"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

type MarkdownBodyProps = {
  children: string;
  className?: string;
};

/** Render markdown with GFM (tables, strikethrough, autolinks). */
export function MarkdownBody({ children, className = "" }: MarkdownBodyProps) {
  // Spoiler syntax: >!text!< → wrap in a <details> equivalent
  const processed = children.replace(/>!(.+?)!</g, (_, inner) => `**[spoiler]** ||${inner}||`);

  const components: Components = {
    p: ({ children: c }) => (
      <p className="mb-2 last:mb-0 text-sm text-hub-text-secondary leading-relaxed">{c}</p>
    ),
    strong: ({ children: c }) => (
      <strong className="font-semibold text-hub-text">{c}</strong>
    ),
    em: ({ children: c }) => <em className="italic text-hub-text-secondary">{c}</em>,
    del: ({ children: c }) => (
      <del className="line-through text-hub-text-muted">{c}</del>
    ),
    h1: ({ children: c }) => (
      <h1 className="text-lg font-bold text-hub-text mt-3 mb-1">{c}</h1>
    ),
    h2: ({ children: c }) => (
      <h2 className="text-base font-bold text-hub-text mt-3 mb-1">{c}</h2>
    ),
    h3: ({ children: c }) => (
      <h3 className="text-sm font-semibold text-hub-text mt-2 mb-1">{c}</h3>
    ),
    ul: ({ children: c }) => (
      <ul className="list-disc list-inside text-sm text-hub-text-secondary mb-2 space-y-0.5">{c}</ul>
    ),
    ol: ({ children: c }) => (
      <ol className="list-decimal list-inside text-sm text-hub-text-secondary mb-2 space-y-0.5">{c}</ol>
    ),
    li: ({ children: c }) => <li className="leading-relaxed">{c}</li>,
    blockquote: ({ children: c }) => (
      <blockquote className="border-l-2 border-hub-cyan/40 pl-3 my-2 text-sm text-hub-text-muted italic">
        {c}
      </blockquote>
    ),
    code: ({ children: c, className: cls }) => {
      const isBlock = cls?.startsWith("language-");
      return isBlock ? (
        <code className="block bg-hub-bg/80 border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-[family-name:var(--font-jetbrains-mono)] text-hub-cyan whitespace-pre-wrap overflow-x-auto my-2">
          {c}
        </code>
      ) : (
        <code className="bg-hub-bg/80 border border-white/[0.06] rounded px-1.5 py-0.5 text-xs font-[family-name:var(--font-jetbrains-mono)] text-hub-cyan">
          {c}
        </code>
      );
    },
    pre: ({ children: c }) => <pre className="my-2">{c}</pre>,
    a: ({ href, children: c }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-hub-cyan underline underline-offset-2 hover:brightness-125"
      >
        {c}
      </a>
    ),
    hr: () => <hr className="border-white/[0.08] my-3" />,
  };

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processed}
      </ReactMarkdown>
    </div>
  );
}
