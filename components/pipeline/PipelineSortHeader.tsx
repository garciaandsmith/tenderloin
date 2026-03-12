"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

interface Props {
  label: string;
  field: string;
  currentSort: string;
  currentDir: string;
  className?: string;
}

export default function PipelineSortHeader({
  label,
  field,
  currentSort,
  currentDir,
  className,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isActive = currentSort === field;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";

  function handleClick() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", field);
    params.set("sort_dir", nextDir);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex items-center gap-1 hover:text-foreground transition-colors w-full",
        isActive ? "text-foreground" : "text-muted-foreground",
        className
      )}
    >
      <span>{label}</span>
      {isActive ? (
        currentDir === "asc" ? (
          <ChevronUp className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
      )}
    </button>
  );
}
