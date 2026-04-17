"use client";

import type { RefObject } from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Link,
  List,
  ListOrdered,
  Quote,
  Code,
  Code2,
} from "lucide-react";

type FormatAction = {
  icon: React.ReactNode;
  label: string;
  wrap?: [string, string];   // wrap selection: [before, after]
  insert?: string;            // insert at cursor if no selection
};

const ACTIONS: FormatAction[] = [
  { icon: <Bold className="h-3.5 w-3.5" />, label: "Bold", wrap: ["**", "**"] },
  { icon: <Italic className="h-3.5 w-3.5" />, label: "Italic", wrap: ["*", "*"] },
  { icon: <Strikethrough className="h-3.5 w-3.5" />, label: "Strikethrough", wrap: ["~~", "~~"] },
  { icon: <Heading2 className="h-3.5 w-3.5" />, label: "Heading", wrap: ["## ", ""] },
  {
    icon: <span className="text-[11px] font-bold leading-none">x²</span>,
    label: "Superscript",
    wrap: ["^", "^"],
  },
  { icon: <Link className="h-3.5 w-3.5" />, label: "Link", wrap: ["[", "](url)"] },
  { icon: <List className="h-3.5 w-3.5" />, label: "Bullet list", wrap: ["- ", ""] },
  { icon: <ListOrdered className="h-3.5 w-3.5" />, label: "Numbered list", wrap: ["1. ", ""] },
  {
    icon: <span className="text-[10px] font-mono leading-none">||</span>,
    label: "Spoiler",
    wrap: [">!", "!<"],
  },
  { icon: <Quote className="h-3.5 w-3.5" />, label: "Quote block", wrap: ["> ", ""] },
  { icon: <Code className="h-3.5 w-3.5" />, label: "Inline code", wrap: ["`", "`"] },
  {
    icon: <Code2 className="h-3.5 w-3.5" />,
    label: "Code block",
    wrap: ["```\n", "\n```"],
  },
];

type FormatToolbarProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  activeFormats: Set<string>;
  onToggleFormat: (label: string) => void;
};

export function FormatToolbar({
  textareaRef,
  value,
  onChange,
  activeFormats,
  onToggleFormat,
}: FormatToolbarProps) {
  function applyFormat(action: FormatAction) {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const [before, after] = action.wrap ?? ["", ""];

    const placeholder = action.label.toLowerCase();
    const insertion = selected || placeholder;
    const newValue =
      value.slice(0, start) + before + insertion + after + value.slice(end);

    onChange(newValue);

    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      if (!el) return;
      const newStart = start + before.length;
      const newEnd = newStart + insertion.length;
      el.focus();
      el.setSelectionRange(newStart, newEnd);
    });

    onToggleFormat(action.label);
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-white/[0.08] bg-hub-bg/60 px-2 py-1.5">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          title={action.label}
          onMouseDown={(e) => {
            e.preventDefault(); // prevent textarea blur
            applyFormat(action);
          }}
          className={`flex h-6 w-6 items-center justify-center rounded text-hub-text-muted transition hover:bg-white/[0.08] hover:text-hub-text ${
            activeFormats.has(action.label)
              ? "bg-hub-cyan/15 text-hub-cyan shadow-[0_0_0_1px_rgba(0,212,255,0.3)]"
              : ""
          }`}
        >
          {action.icon}
        </button>
      ))}
    </div>
  );
}
