"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchLg } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { STATUS_COLORS } from "@/lib/utils/constants";

interface SearchResult {
  id: string;
  name: string;
  email: string;
  company: string | null;
  planName: string | null;
  status: string | null;
  matchType: string;
}

export function GlobalSearch({ dropUp = false }: { dropUp?: boolean } = {}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data.results);
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Cmd+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      router.push(`/accounts/${result.id}`);
      setIsOpen(false);
      setQuery("");
      setResults([]);
    },
    [router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    },
    [results, selectedIndex, handleSelect]
  );

  return (
    <div className="relative w-full">
      <div className="relative">
        <SearchLg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-quaternary" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search accounts... (⌘K)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border border-secondary bg-primary py-2 pl-9 pr-3 text-sm text-primary placeholder:text-quaternary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </div>

      {isOpen && results.length > 0 && (
        <div className={`absolute z-50 w-full rounded-xl border border-secondary bg-primary shadow-lg ${dropUp ? "bottom-full mb-1" : "mt-1"}`}>
          <div className="max-h-80 overflow-y-auto py-1">
            {results.map((result, index) => (
              <button
                key={result.id}
                className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
                  index === selectedIndex ? "bg-secondary" : "hover:bg-secondary"
                }`}
                onMouseDown={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-primary">
                    {result.company || result.name}
                  </p>
                  <p className="truncate text-xs text-tertiary">{result.email}</p>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  {result.planName && (
                    <Badge color="brand" size="sm">{result.planName}</Badge>
                  )}
                  {result.status && (
                    <Badge color={STATUS_COLORS[result.status] ?? "gray"} size="sm">
                      {result.status}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
