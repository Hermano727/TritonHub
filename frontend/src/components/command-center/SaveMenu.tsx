"use client";

type Props = {
  open: boolean;
  onToggle: () => void;
  onOverwrite: () => void;
  onSaveAsNew: () => void;
  onClose: () => void;
};

export function SaveMenu({ open, onToggle, onOverwrite, onSaveAsNew, onClose }: Props) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-lg border border-hub-cyan/35 bg-hub-cyan/10 px-2.5 py-1.5 text-[11px] font-semibold text-hub-cyan transition hover:bg-hub-cyan/18"
      >
        Save
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-44 rounded-lg border border-white/[0.06] bg-hub-surface p-2 shadow-lg">
          <button
            type="button"
            onClick={() => { onOverwrite(); onClose(); }}
            className="w-full text-left py-1 px-2 text-sm hover:bg-white/5"
          >
            Overwrite
          </button>
          <button
            type="button"
            onClick={() => { onSaveAsNew(); onClose(); }}
            className="w-full text-left py-1 px-2 text-sm hover:bg-white/5"
          >
            Save as new
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full text-left py-1 px-2 text-sm text-hub-text-muted hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
