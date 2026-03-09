from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional


class SupabaseStateStore:
    """Persist pipeline state in Supabase PostgreSQL.

    Implements the same interface as StateStore so CaptureService requires no
    changes when switching backends.
    """

    def __init__(self, supabase_url: str, service_role_key: str) -> None:
        from supabase import create_client  # lazy import

        self._client = create_client(supabase_url, service_role_key)

    def get_last_run_at(self, key: str = "capture.last_successful_run_at") -> Optional[datetime]:
        response = (
            self._client.table("pipeline_state")
            .select("value")
            .eq("key", key)
            .maybe_single()
            .execute()
        )
        if not response.data:
            return None
        return datetime.fromisoformat(response.data["value"])

    def set_last_run_at(
        self,
        run_at: datetime,
        key: str = "capture.last_successful_run_at",
    ) -> None:
        if run_at.tzinfo is None:
            run_at = run_at.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc).isoformat()
        self._client.table("pipeline_state").upsert(
            {"key": key, "value": run_at.isoformat(), "updated_at": now}
        ).execute()
