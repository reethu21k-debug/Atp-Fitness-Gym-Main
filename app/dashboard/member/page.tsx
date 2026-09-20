import Link from "next/link";
import { format } from "date-fns";
import { Wallet, Dumbbell, Salad, QrCode, Ruler } from "lucide-react";
import { getCurrentProfile } from "@/lib/utils/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProgressHistory, getMemberHeightCm } from "@/lib/actions/trainer.actions";
import { calculateBmi } from "@/lib/utils/fitness";
import { getWelcomeMessage } from "@/lib/utils/welcome";
import { StatCard } from "@/components/features/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { MemberStatusBadge } from "@/components/features/members/status-badge";

export const metadata = { title: "Dashboard — ATP Fitness" };

export default async function MemberDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createClient();
  const [{ data: membership }, progress, heightCm] = await Promise.all([
    supabase.from("members_overview").select("*").eq("profile_id", profile.id).single(),
    getProgressHistory(profile.id, "month"),
    getMemberHeightCm(profile.id),
  ]);

  const latest = progress.length > 0 ? progress[progress.length - 1] : null;
  const bmi = latest?.weight_kg && heightCm ? calculateBmi(latest.weight_kg, heightCm) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{getWelcomeMessage(profile.role, profile.full_name)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here's where things stand.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Latest weight" value={latest?.weight_kg ? `${latest.weight_kg} kg` : "—"} icon={Ruler} />
        <StatCard label="BMI" value={bmi ?? "—"} icon={Ruler} tone="success" />
        <StatCard label="Membership" value={membership?.status ?? "—"} icon={Wallet} tone="warning" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current plan</p>
            <p className="mt-1 font-medium">{membership?.plan_name ?? "No active plan"}</p>
            {membership?.end_date && (
              <p className="mt-1 text-sm text-muted-foreground">Expires {format(new Date(membership.end_date), "dd MMM yyyy")}</p>
            )}
          </div>
          {membership?.status && <MemberStatusBadge status={membership.status} />}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickLink href="/dashboard/member/workout" icon={Dumbbell} label="Workout plan" />
        <QuickLink href="/dashboard/member/diet" icon={Salad} label="Diet plan" />
        <QuickLink href="/dashboard/member/attendance" icon={QrCode} label="Check in" />
      </div>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-lg">
        <CardContent className="flex items-center gap-3 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <p className="font-medium">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );
}