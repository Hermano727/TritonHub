"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { createReply } from "@/lib/api/community";
import { FormatToolbar } from "./FormatToolbar";
import type { ReplyOut } from "@/types/community";

type ReplyComposerProps = {
  postId: string;
  parentReplyId?: string;
  /** Called with the full updated reply list (from PostDetail) */
  onSubmitted: (replies: ReplyOut[]) => void;
  onCancel?: () => void;
  /** If true, starts expanded (used for inline reply-to-reply) */
  startExpanded?: boolean;
};

export function ReplyComposer({
  postId,
  parentReplyId,
  onSubmitted,
  onCancel,
  startExpanded = false,
}: ReplyComposerProps) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [body, setBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleToggleFormat(label: string) {
    setActiveFormats((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function handleCancel() {
    setExpanded(false);
    setBody("");
    setIsAnonymous(false);
    setActiveFormats(new Set());
    setError(null);
    onCancel?.();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await createReply(postId, {
        body: body.trim(),
        parentReplyId,
        isAnonymous,
      });
      onSubmitted(updated.replies);
      handleCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post reply");
    } finally {
      setLoading(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-xl border border-white/[0.08] bg-hub-bg/40 px-4 py-3 text-left text-sm text-hub-text-muted transition hover:border-hub-cyan/20 hover:bg-hub-bg/60 hover:text-hub-text-secondary"
      >
        Join the conversation…
      </button>
    );
  }

  return (
    <div className="glass-panel rounded-xl border border-hub-cyan/20 bg-hub-bg/60">
      <FormatToolbar
        textareaRef={textareaRef}
        value={body}
        onChange={setBody}
        activeFormats={activeFormats}
        onToggleFormat={handleToggleFormat}
      />
      <form onSubmit={handleSubmit} className="flex flex-col">
        <textarea
          ref={textareaRef}
          required
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What are your thoughts?"
          className="w-full resize-none rounded-none border-x border-x-transparent bg-transparent px-4 py-3 text-sm text-hub-text outline-none placeholder:text-hub-text-muted focus:border-x-transparent"
        />

        <div className="flex items-center justify-between gap-3 rounded-b-xl border-t border-white/[0.06] bg-hub-bg/40 px-3 py-2">
          {/* Left: attach (no-op) + anon toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Attach image (coming soon)"
              className="flex h-7 w-7 items-center justify-center rounded text-hub-text-muted/50 transition hover:text-hub-text-muted"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>

            <label className="flex cursor-pointer items-center gap-2 select-none">
              <span className="relative">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                />
                <span className="block h-4 w-7 rounded-full border border-white/[0.1] bg-white/[0.08] transition-colors peer-checked:border-hub-cyan/50 peer-checked:bg-hub-cyan/20" />
                <span className="absolute left-0.5 top-0.5 block h-3 w-3 rounded-full bg-hub-text-muted shadow transition-all peer-checked:translate-x-3 peer-checked:bg-hub-cyan" />
              </span>
              <span className="text-xs text-hub-text-muted">Anonymous</span>
            </label>
          </div>

          {/* Right: cancel + comment */}
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-hub-danger">{error}</span>}
            <button
              type="button"
              onClick={handleCancel}
              className="h-7 rounded-lg px-3 text-xs text-hub-text-muted transition hover:text-hub-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !body.trim()}
              className="h-7 rounded-lg bg-hub-cyan px-3 text-xs font-medium text-hub-bg transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Posting…" : "Comment"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
