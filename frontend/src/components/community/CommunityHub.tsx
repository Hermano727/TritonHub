"use client";

import { useState, useTransition } from "react";
import { PlusCircle, Search, X, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { listPosts } from "@/lib/api/community";
import type { PostListResponse, PostSummary } from "@/types/community";
import { CreatePostModal } from "./CreatePostModal";
import { PostCard } from "./PostCard";

type CommunityHubProps = {
  initialPosts: PostSummary[];
  initialTotal: number;
};

export function CommunityHub({ initialPosts, initialTotal }: CommunityHubProps) {
  const [posts, setPosts] = useState<PostSummary[]>(initialPosts);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [filterCode, setFilterCode] = useState("");
  const [filterInput, setFilterInput] = useState("");
  const [isPending, startTransition] = useTransition();

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function fetchPosts(opts: { courseCode?: string; page: number }) {
    startTransition(async () => {
      try {
        const data: PostListResponse = await listPosts(opts);
        setPosts(data.posts);
        setTotal(data.total);
        setPage(data.page);
      } catch {
        // keep current state on error
      }
    });
  }

  function applyFilter(e: React.FormEvent) {
    e.preventDefault();
    const code = filterInput.trim();
    setFilterCode(code);
    fetchPosts({ courseCode: code || undefined, page: 1 });
  }

  function clearFilter() {
    setFilterInput("");
    setFilterCode("");
    fetchPosts({ page: 1 });
  }

  function handlePostCreated(post: PostSummary) {
    setPosts((prev) => [post, ...prev]);
    setTotal((t) => t + 1);
  }

  return (
    <div className="w-full px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-hub-cyan" />
            <h1 className="text-2xl font-bold text-hub-text">Community</h1>
          </div>
          <div className="mt-0.5 h-px w-24 bg-gradient-to-r from-hub-cyan/60 to-transparent" />
          <p className="mt-1 text-sm text-hub-text-muted">
            Ask questions and share insights with other Tritons
          </p>
          <p className="mt-0.5 text-xs text-hub-text-muted">
            {total} {total === 1 ? "discussion" : "discussions"}
          </p>
        </div>
        <CreatePostModal
          trigger={
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-hub-cyan px-4 text-sm font-medium text-hub-bg transition hover:brightness-110"
            >
              <PlusCircle className="h-4 w-4" />
              New Post
            </button>
          }
          onCreated={handlePostCreated}
        />
      </div>

      {/* Filter */}
      <form onSubmit={applyFilter} className="mb-6">
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-hub-text-muted" />
          <input
            type="text"
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            placeholder="Filter by course code (e.g. CSE 110) — press Enter to apply"
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-hub-bg/80 pl-9 pr-8 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
          />
          {filterInput && (
            <button
              type="button"
              onClick={clearFilter}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-hub-text-muted transition hover:text-hub-text"
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
      </form>

      {/* Post list */}
      <div
        className={`flex flex-col gap-3 transition-opacity ${isPending ? "opacity-50" : "opacity-100"}`}
      >
        {posts.length === 0 ? (
          <div className="glass-panel rounded-xl border border-white/[0.08] p-10 text-center">
            <p className="text-hub-text-secondary">No posts yet.</p>
            <p className="mt-1 text-sm text-hub-text-muted">
              Be the first to start a discussion!
            </p>
          </div>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || isPending}
            onClick={() =>
              fetchPosts({ courseCode: filterCode || undefined, page: page - 1 })
            }
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.08] px-3 text-sm text-hub-text-secondary transition hover:text-hub-text disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>
          <span className="text-sm text-hub-text-muted">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || isPending}
            onClick={() =>
              fetchPosts({ courseCode: filterCode || undefined, page: page + 1 })
            }
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.08] px-3 text-sm text-hub-text-secondary transition hover:text-hub-text disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
