"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCcw01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";

interface EnrichButtonProps {
  accountId: string;
  hasEnrichment: boolean;
}

export function EnrichButton({ accountId, hasEnrichment }: EnrichButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleEnrich() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/account/${accountId}/enrich`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_API_KEY}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to request enrichment");
      }

      toast.success("Enrichment requested", {
        description: "Results will appear shortly",
      });

      // Refresh after a delay to pick up webhook results
      setTimeout(() => router.refresh(), 10000);
    } catch (err) {
      toast.error("Enrichment failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button
      color="secondary"
      size="sm"
      onClick={handleEnrich}
      isLoading={isLoading}
      iconLeading={hasEnrichment ? RefreshCcw01 : undefined}
    >
      {hasEnrichment ? "Re-enrich" : "Enrich"}
    </Button>
  );
}
