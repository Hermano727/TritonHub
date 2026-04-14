"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { toggleReplyUpvote, toggleReplyDownvote } from "@/lib/api/community";
import { timeAgo, getInitials } from "@/lib/community/utils";
import { MarkdownBody } from "./MarkdownBody";
import { ReplyComposer } from "./ReplyComposer";
import type { ReplyOut } from "@/types/community";

const MAX_VISUAL_DEPTH = 6;

type ReplyNodeProps = {
  reply: ReplyOut;
  postId: string;
  depth: number;
  children: ReplyOut[];
  allReplies: ReplyOut[];
  onRepliesUpdated: (replies: ReplyOut[]) => void;
};

export function ReplyNode({
  reply,
  postId,
  depth,
  children,
  allReplies,
  onRepliesUpdated,
}: ReplyNodeProps) {
  const [upvoteCount, setUpvoteCount] = useState(reply.upvoteCount);
  const [downvoteCount, setDownvoteCount] = useState(reply.downvoteCount);
  const [userHasUpvoted, setUserHasUpvoted] = useState(reply.userHasUpvoted);
  const [userHasDownvoted, setUserHasDownvoted] = useState(reply.userHasDownvoted);
  const [voting, setVoting] = useState(false);
  const [showReplyComposer, setShowReplyComposer] = useState(false);

  const score = upvoteCount - downvoteCount;
  const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH);

  async function handleUpvote() {
    if (voting) return;
    const prev = { upvoteCount, userHasUpvoted };
    setUserHasUpvoted(!userHasUpvoted);
    setUpvoteCount((c) => (userHasUpvoted ? c - 1 : c + 1));
    if (userHasDownvoted) {
      setUserHasDownvoted(false);
      setDownvoteCount((c) => c - 1);
    }
    setVoting(true);
    try {
      const res = await toggleReplyUpvote(postId, reply.id);
      setUserHasUpvoted(res.voted);
      setUpvoteCount(res.upvoteCount);
      setDownvoteCount(res.downvoteCount);
      setUserHasDownvoted(false);
    } catch {
      setUserHasUpvoted(prev.userHasUpvoted);
      setUpvoteCount(prev.upvoteCount);
    } finally {
      setVoting(false);
    }
  }

  async function handleDownvote() {
    if (voting) return;
    const prev = { downvoteCount, userHasDownvoted };
    setUserHasDownvoted(!userHasDownvoted);
    setDownvoteCount((c) => (userHasDownvoted ? c - 1 : c + 1));
    if (userHasUpvoted) {
      setUserHasUpvoted(false);
      setUpvoteCount((c) => c - 1);
    }
    setVoting(true);
    try {
      const res = await toggleReplyDownvote(postId, reply.id);
      setUserHasDownvoted(res.voted);
      setDownvoteCount(res.downvoteCount);
      setUpvoteCount(res.upvoteCount);
      setUserHasUpvoted(false);
    } catch {
      setUserHasDownvoted(prev.userHasDownvoted);
      setDownvoteCount(prev.downvoteCount);
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className={`flex gap-0 ${depth > 0 ? "mt-2" : ""}`}>
      {/* Depth line */}
      {depth > 0 && (
        <div
          className="mr-3 shrink-0 cursor-pointer"
          style={{ width: `${visualDepth * 16}px` }}
        >
          <div className="ml-auto h-full w-0.5 rounded-full bg-white/[0.08] hover:bg-hub-cyan/30 transition-colors" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="mb-1.5 flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hub-cyan/10 text-[10px] font-semibold text-hub-cyan">
            {getInitials(reply.authorDisplayName)}
          </div>
          <span className="text-xs font-medium text-hub-text-secondary">{reply.authorDisplayName}</span>
          <span className="text-xs text-hub-text-muted">·</span>
          <span className="text-xs text-hub-text-muted">{timeAgo(reply.createdAt)}</span>
        </div>

        {/* Body */}
        <MarkdownBody className="mb-2">{reply.body}</MarkdownBody>

        {/* Actions row */}
        <div className="flex items-center gap-3">
          {/* Votes */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={handleUpvote}
              disabled={voting}
              aria-label="Upvote"
              className={`flex h-6 w-6 items-center justify-center rounded transition disabled:opacity-50 ${
                userHasUpvoted
                  ? "text-hub-cyan"
                  : "text-hub-text-muted hover:text-hub-cyan"
              }`}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <span
              className={`min-w-[1.5rem] text-center text-xs font-medium tabular-nums ${
                score > 0
                  ? "text-hub-cyan"
                  : score < 0
                  ? "text-hub-danger"
                  : "text-hub-text-muted"
              }`}
            >
              {score}
            </span>
            <button
              type="button"
              onClick={handleDownvote}
              disabled={voting}
              aria-label="Downvote"
              className={`flex h-6 w-6 items-center justify-center rounded transition disabled:opacity-50 ${
                userHasDownvoted
                  ? "text-hub-danger"
                  : "text-hub-text-muted hover:text-hub-danger"
              }`}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Reply link */}
          <button
            type="button"
            onClick={() => setShowReplyComposer((v) => !v)}
            className="text-xs text-hub-text-muted transition hover:text-hub-cyan"
          >
            Reply
          </button>
        </div>

        {/* Inline reply composer */}
        {showReplyComposer && (
          <div className="mt-2">
            <ReplyComposer
              postId={postId}
              parentReplyId={reply.id}
              onSubmitted={onRepliesUpdated}
              onCancel={() => setShowReplyComposer(false)}
              startExpanded
            />
          </div>
        )}

        {/* Child replies */}
        {children.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {children.map((child) => (
              <ReplyNode
                key={child.id}
                reply={child}
                postId={postId}
                depth={depth + 1}
                children={allReplies.filter((r) => r.parentReplyId === child.id)}
                allReplies={allReplies}
                onRepliesUpdated={onRepliesUpdated}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
