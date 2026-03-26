"use client";

import { useEffect } from "react";

interface Props {
  tenderId: number;
  projectId: string;
}

/**
 * Fires a PATCH to mark inbox_seen_at on first render.
 * Idempotent: the API only sets the value if it is still NULL.
 */
export default function InboxSeenTracker({ tenderId, projectId }: Props) {
  useEffect(() => {
    fetch(`/api/tenders/${tenderId}/seen?projectId=${projectId}`, {
      method: "PATCH",
    }).catch(() => {
      // Non-fatal — tracking failure should not interrupt the user
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
