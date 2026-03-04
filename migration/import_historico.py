"""Step 3 of data migration: import historico_licitaciones.csv into Supabase.

This creates stub tenders in tenders_raw (source='historico_csv') and
populates tender_scores with the existing 0-5 human scores, giving the ML
model immediate training data.

Requires:
    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
    SEED_PROJECT_ID  — UUID of the project to attach these scores to
    SEED_USER_ID     — UUID of the admin user who "scored" the historic data

Run from the project root:
    SEED_PROJECT_ID=<uuid> SEED_USER_ID=<uuid> python migration/import_historico.py
"""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

CSV_PATH = Path("data/historico_licitaciones.csv")
SOURCE = "historico_csv"


def main() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    project_id = os.environ.get("SEED_PROJECT_ID")
    user_id = os.environ.get("SEED_USER_ID")

    if not all([url, key, project_id, user_id]):
        print(
            "ERROR: Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, "
            "SEED_PROJECT_ID, and SEED_USER_ID environment variables."
        )
        sys.exit(1)

    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: supabase-py not installed. Run: pip install supabase")
        sys.exit(1)

    if not CSV_PATH.exists():
        print(f"ERROR: {CSV_PATH} not found.")
        sys.exit(1)

    client = create_client(url, key)

    imported = skipped = 0
    with CSV_PATH.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            link = (row.get("InformacionWeb") or "").strip()
            objeto = (row.get("Objeto") or "").strip()
            score_str = (row.get("Score") or "").strip()

            if not link or not objeto or not score_str:
                skipped += 1
                continue

            try:
                score = int(float(score_str))
            except ValueError:
                skipped += 1
                continue

            if score < 0 or score > 5:
                skipped += 1
                continue

            # Parse budget (may contain commas or dots as decimal separator)
            budget_raw = (row.get("Presupuesto") or "").strip().replace(",", ".")
            try:
                budget = float(budget_raw) if budget_raw else None
            except ValueError:
                budget = None

            # Upsert stub tender (external_id = link, source = 'historico_csv')
            tender_resp = (
                client.table("tenders_raw")
                .upsert(
                    {
                        "external_id": link,
                        "title": objeto[:250],
                        "summary": objeto,
                        "link": link if link.startswith("http") else f"https://{link}",
                        "published_at": "2025-01-01T00:00:00+00:00",
                        "buyer_name": (row.get("OrganismoConvocante") or "").strip(),
                        "region": "",
                        "cpv": "",
                        "budget_amount": budget,
                        "source": SOURCE,
                        "created_at": "2025-01-01T00:00:00+00:00",
                    },
                    on_conflict="external_id,source",
                    ignore_duplicates=False,
                )
                .execute()
            )

            if not tender_resp.data:
                skipped += 1
                continue

            tender_id = tender_resp.data[0]["id"]

            # Upsert the human score
            client.table("tender_scores").upsert(
                {
                    "tender_id": tender_id,
                    "project_id": project_id,
                    "scored_by": user_id,
                    "score": score,
                },
                on_conflict="tender_id,project_id,scored_by",
                ignore_duplicates=True,
            ).execute()

            imported += 1

    print(f"Historico CSV: {imported} tenders imported, {skipped} skipped")


if __name__ == "__main__":
    main()
