import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ tenderId: string }>;
}

/**
 * PATCH /api/tenders/[tenderId]/seen?projectId=<uuid>
 *
 * Sets inbox_seen_at for this tender+project pair if not already set.
 * Idempotent: subsequent calls are no-ops.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { tenderId } = await params;
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId query param is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only update if inbox_seen_at is still NULL (first open wins).
  const { error } = await supabase
    .from("tender_filter_results")
    .update({ inbox_seen_at: new Date().toISOString() })
    .eq("tender_id", Number(tenderId))
    .eq("project_id", projectId)
    .is("inbox_seen_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
