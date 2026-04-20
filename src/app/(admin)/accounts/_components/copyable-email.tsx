"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { Copy01 } from "@untitledui/icons";
import { toast } from "sonner";
import { useClipboard } from "@/hooks/use-clipboard";
import { cx } from "@/utils/cx";

interface CopyableEmailProps {
  email: string;
  className?: string;
}

export function CopyableEmail({ email, className }: CopyableEmailProps) {
  const { copy } = useClipboard();

  async function handleCopy() {
    const result = await copy(email);
    if (result.success) {
      toast.success("Email copied to clipboard");
    } else {
      toast.error("Failed to copy email");
    }
  }

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleCopy();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      handleCopy();
    }
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title="Click to copy"
      className={cx(
        "group inline-flex max-w-full cursor-pointer items-center gap-1 hover:text-primary",
        className,
      )}
    >
      <span className="truncate">{email}</span>
      <Copy01
        aria-hidden
        className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
      />
    </span>
  );
}
