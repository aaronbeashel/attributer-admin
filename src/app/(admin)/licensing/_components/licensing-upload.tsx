"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { UploadCloud01 } from "@untitledui/icons";

export function LicensingUpload() {
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ totalRows: number; uniqueDomains: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setProcessing(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/licensing/process", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Processing failed");
      }

      const data = await res.json();
      setResult({ totalRows: data.totalRows, uniqueDomains: data.uniqueDomains });
      toast.success("CSV imported", {
        description: `${data.uniqueDomains} domains imported. They'll be processed by the next cron run.`,
      });
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setProcessing(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div
        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-secondary bg-primary px-6 py-8 text-center transition-colors hover:border-brand-primary"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file && file.name.endsWith(".csv")) handleUpload(file);
        }}
      >
        <UploadCloud01 className="mb-2 h-8 w-8 text-quaternary" />
        <p className="text-sm font-medium text-primary">
          Drag & drop a CSV, or{" "}
          <button className="text-brand-primary hover:underline" onClick={() => fileInputRef.current?.click()}>
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-tertiary">Domains will be imported and processed by the cron pipeline</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
      </div>

      {processing && (
        <div className="rounded-xl border border-secondary bg-primary px-6 py-6 text-center">
          <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-4 border-secondary border-t-brand-primary" />
          <p className="text-sm text-tertiary">Importing domains...</p>
        </div>
      )}

      {result && (
        <div className="rounded-lg bg-success-secondary px-4 py-3 text-sm text-success-primary">
          Imported {result.totalRows} rows ({result.uniqueDomains} unique domains). They will be processed automatically.
        </div>
      )}
    </div>
  );
}
