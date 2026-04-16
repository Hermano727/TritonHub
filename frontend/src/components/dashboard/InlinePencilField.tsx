"use client";

import { useRef, useState } from "react";
import { Pencil } from "lucide-react";

type Props = {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
  /** Render as textarea for multi-line content */
  multiline?: boolean;
};

export function InlinePencilField({ value, placeholder, onSave, multiline }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(value);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      taRef.current?.focus();
    }, 0);
  };

  const commit = () => {
    onSave(draft.trim() || value);
    setEditing(false);
  };

  if (editing) {
    const sharedClass =
      "min-w-0 flex-1 rounded border border-hub-cyan/40 bg-hub-bg/60 px-2 py-0.5 text-sm text-hub-text outline-none focus:border-hub-cyan/70 resize-none";
    const onKeyDown = (e: React.KeyboardEvent) => {
      if (!multiline && e.key === "Enter") commit();
      if (e.key === "Escape") setEditing(false);
    };

    return (
      <div className="flex items-start gap-1.5" onClick={(e) => e.stopPropagation()}>
        {multiline ? (
          <textarea
            ref={taRef}
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className={sharedClass}
          />
        ) : (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className={sharedClass}
          />
        )}
      </div>
    );
  }

  return (
    <div className="group/field flex items-center gap-1">
      <span className={value ? "" : "italic text-hub-text-muted"}>{value || placeholder}</span>
      <button
        type="button"
        onClick={open}
        title="Edit manually"
        className="opacity-0 transition group-hover/field:opacity-100 text-hub-text-muted hover:text-hub-cyan"
      >
        <Pencil className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
