"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  currentPage: number;
  totalPages: number;
  perPage: number;
}

export default function PipelinePagination({ currentPage, totalPages, perPage }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`${pathname}?${params.toString()}`);
  }

  function setPerPage(n: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("per_page", String(n));
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  // Build visible page numbers (show at most 7 pages with ellipsis)
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between mt-4 gap-4 flex-wrap">
      {/* Per-page selector */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Mostrar</span>
        {[10, 25, 50, 100].map((n) => (
          <button
            key={n}
            onClick={() => setPerPage(n)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              perPage === n
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/70"
            }`}
          >
            {n}
          </button>
        ))}
        <span>por página</span>
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-sm">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => goToPage(p as number)}
              className={`min-w-[32px] h-8 rounded text-sm font-medium transition-colors ${
                p === currentPage
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
