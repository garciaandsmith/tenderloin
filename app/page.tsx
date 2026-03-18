import { redirect } from "next/navigation";

// Root page — middleware handles auth redirects, but this is a safe fallback.
export default function RootPage() {
  redirect("/home");
}
