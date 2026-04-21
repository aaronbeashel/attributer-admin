"use client";

import type { MouseEvent } from "react";
import { Copy01 } from "@untitledui/icons";
import { toast } from "sonner";
import { useClipboard } from "@/hooks/use-clipboard";
import { cx } from "@/utils/cx";

interface CopyableLinkProps {
  href: string;
  value: string;
  label?: string;
  className?: string;
}

export function CopyableLink({ href, value, label = "Link", className }: CopyableLinkProps) {
  const { copy } = useClipboard();

  async function handleCopy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const result = await copy(value);
    if (result.success) {
      toast.success(`${label} copied to clipboard`);
    } else {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  }

  return (
    <span className={cx("group inline-flex max-w-full items-center gap-1.5", className)}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 truncate text-brand-primary hover:underline"
      >
        {value}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        title={`Copy ${label.toLowerCase()}`}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="shrink-0 cursor-pointer rounded p-0.5 text-tertiary opacity-0 transition-opacity hover:bg-secondary focus-visible:opacity-70 group-hover:opacity-70"
      >
        <Copy01 aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}
