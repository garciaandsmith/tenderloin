import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTrainingTenderBatch } from "@/lib/queries/tenders";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const url = new URL(req.url);
  const excludeParam = url.searchParams.get("exclude");
  const limitParam = url.searchParams.get("limit");

  const excludeIds = excludeParam
    ? excludeParam
        .split(",")
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0)
    : [];
  const limit = limitParam ? Math.min(Math.max(1, Number(limitParam)), 20) : 10;

  const tenders = await getTrainingTenderBatch(projectId, user.id, excludeIds, limit);
  return NextResponse.json({ tenders });
}
