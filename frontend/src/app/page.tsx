import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get profile to check role for redirection
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile && ["manager", "admin"].includes(profile.role)) {
    redirect("/manager/overview");
  }

  if (profile && profile.role === "agent") {
    redirect("/agent/dashboard");
  }

  // Default redirect for customers
  redirect("/tickets");
}
