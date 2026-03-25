"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
  isActive: boolean;
}

/**
 * Invisible client component that calls router.refresh() every 15 seconds
 * while an analysis is in pending or running state. This re-fetches the
 * server component so the page reflects the latest status without a full
 * browser reload or manual refresh.
 */
export default function AnalysisPoller({ isActive }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(id);
  }, [isActive, router]);

  return null;
}
