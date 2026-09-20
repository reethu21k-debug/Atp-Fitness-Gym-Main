import Link from "next/link";
import { Users, Dumbbell, Salad } from "lucide-react";
import { getMyClients } from "@/lib/actions/trainer.actions";
import { getCurrentProfile } from "@/lib/utils/permissions";
import { createClient } from "@/lib/supabase/server";
import { getWelcomeMessage } from "@/lib/utils/welcome";
import { StatCard } from "@/components/features/dashboard/stat-card";

export const metadata = { title: "Dashboard — ATP Fitness" };

export default async function TrainerDashboardPage() {
  const [clients, profile] = await Promise.all([getMyClients(), getCurrentProfile()]);
  const supabase = await createClient();

  const [{ count: activePlans }, { count: activeDietPlans }] = await Promise.all([
    supabase
      .from("workout_plans")
      .select("*", { count: "exact", head: true })
      .eq("trainer_id", profile?.id ?? "")
      .eq("is_active", true),
    supabase
      .from("diet_plans")
      .select("*", { count: "exact", head: true })
      .eq("trainer_id", profile?.id ?? "")
      .eq("is_active", true),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {profile ? getWelcomeMessage(profile.role, profile.full_name) : "Overview"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Your clients and active plans.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Assigned clients" value={clients.length} icon={Users} />
        <StatCard label="Active workout plans" value={activePlans ?? 0} icon={Dumbbell} tone="success" />
        <StatCard label="Active diet plans" value={activeDietPlans ?? 0} icon={Salad} tone="warning" />
      </div>

      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        Open a client from{" "}
        <Link href="/dashboard/trainer/clients" className="text-primary hover:underline">My Clients</Link>{" "}
        to build workout plans, diet plans, and log progress.
      </div>
    </div>
  );
}