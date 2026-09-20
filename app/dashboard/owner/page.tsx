import Link from "next/link";
import { Users, UserCheck, Clock, AlertTriangle, Plus } from "lucide-react";
import { getMemberDashboardStats } from "@/lib/actions/member.actions";
import { getCurrentProfile } from "@/lib/utils/permissions";
import { getWelcomeMessage } from "@/lib/utils/welcome";
import { StatCard } from "@/components/features/dashboard/stat-card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Dashboard — ATP Fitness" };

export default async function OwnerDashboardPage() {
  const [stats, profile] = await Promise.all([getMemberDashboardStats(), getCurrentProfile()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {profile ? getWelcomeMessage(profile.role, profile.full_name) : "Overview"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Here's how your gym is doing today.</p>
        </div>
        <Button asChild className="sm:shrink-0">
          <Link href="/dashboard/owner/members/new"><Plus className="h-4 w-4" /> Add member</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total members" value={stats.totalMembers} icon={Users} />
        <StatCard label="Active members" value={stats.activeMembers} icon={UserCheck} tone="success" />
        <StatCard label="Expiring in 7 days" value={stats.expiringSoon} icon={Clock} tone="warning" />
        <StatCard label="Expired memberships" value={stats.expired} icon={AlertTriangle} tone="destructive" />
      </div>

      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        Attendance, revenue, trainer performance, and forecast widgets land here as
        those modules ship (see the project's <code>BUILD_STATUS.md</code> roadmap).
        The <Link href="/dashboard/owner/members" className="text-primary hover:underline">Members</Link> section
        is fully live — add, search, and manage members now.
      </div>
    </div>
  );
}