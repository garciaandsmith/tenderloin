import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ tenderId: string }>;
}

/**
 * DELETE /api/tenders/[tenderId]/dismiss?projectId=<uuid>
 *
 * Dismisses a tender from the project inbox by setting dismissed_at.
 * Idempotent: re-dismissing an already-dismissed tender is a no-op.
 *
 * PATCH /api/tenders/[tenderId]/dismiss?projectId=<uuid>
 *
 * Restores a dismissed tender (clears dismissed_at).
 */
export async function DELETE(request: Request, { params }: Params) {
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

  const { error } = await supabase
    .from("tender_filter_results")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("tender_id", Number(tenderId))
    .eq("project_id", projectId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

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

  const { error } = await supabase
    .from("tender_filter_results")
    .update({ dismissed_at: null })
    .eq("tender_id", Number(tenderId))
    .eq("project_id", projectId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
