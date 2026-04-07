import { NextResponse } from "next/server";
import { createClient, createAuthAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { email } = body as { email: string };
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email válido requerido" }, { status: 400 });
  }

  const authAdmin = createAuthAdminClient();
  const { data, error } = await authAdmin.auth.admin.inviteUserByEmail(email);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.user.id, email: data.user.email }, { status: 201 });
}
