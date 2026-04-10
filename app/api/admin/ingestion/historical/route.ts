import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface HistoricalBody {
  startMonth: string; // YYYY-MM
  endMonth: string;   // YYYY-MM
}

function isValidMonth(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Dispatch the ingest_historical GitHub Actions workflow with a date range. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: HistoricalBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { startMonth, endMonth } = body;
  if (!isValidMonth(startMonth) || !isValidMonth(endMonth)) {
    return NextResponse.json(
      { error: "startMonth and endMonth must be in YYYY-MM format" },
      { status: 400 }
    );
  }

  if (startMonth > endMonth) {
    return NextResponse.json(
      { error: "startMonth must be ≤ endMonth" },
      { status: 400 }
    );
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return NextResponse.json(
      { error: "GitHub env vars not configured (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)" },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/ingest_historical.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          start_month: startMonth,
          end_month: endMonth,
        },
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: `GitHub API error: ${text}` }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    message: `Historical ingestion workflow triggered for ${startMonth} → ${endMonth}`,
  });
}
