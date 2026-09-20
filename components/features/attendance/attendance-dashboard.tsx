import Link from "next/link";
import { format } from "date-fns";
import { Users, Clock, Timer, Monitor, ChevronRight } from "lucide-react";
import {
  getTodayAttendance,
  getAttendanceStats,
  getGymStreaksOverview,
} from "@/lib/actions/attendance.actions";
import { StatCard } from "@/components/features/dashboard/stat-card";
import { PeakHoursChart } from "@/components/features/attendance/peak-hours-chart";
import { StreaksOverviewWidget } from "@/components/features/attendance/streaks-overview-widget";
import { ManualCheckInPanel } from "@/components/features/attendance/manual-checkin-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export async function AttendanceDashboard({
  kioskPath,
}: {
  kioskPath: string;
}) {
  const [today, stats, streaks] = await Promise.all([
    getTodayAttendance(),
    getAttendanceStats(),
    getGymStreaksOverview(),
  ]);

  return (
    <div className="space-y-8 p-1 sm:p-4">
      {/* Header Section - Glassmorphic Container */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-border/40 bg-card/30 p-6 shadow-lg backdrop-blur-xl transition-all duration-300 hover:bg-card/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Attendance</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Live check-ins, peak hours, and today's visits.
          </p>
        </div>
        <Button 
          asChild 
          variant="outline" 
          className="sm:shrink-0 w-full sm:w-auto bg-background/50 backdrop-blur-md border-border/50 hover:bg-background/80 shadow-sm transition-all"
        >
          <Link href={kioskPath}>
            <Monitor className="mr-2 h-4 w-4" /> Open check-in kiosk
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Note: Pass these classNames to your StatCard if it accepts them to ensure the glass effect cascades properly */}
        <div className="rounded-2xl border border-border/40 bg-card/30 shadow-lg backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-xl">
          <StatCard
            label="Checked in today"
            value={stats.todayCount}
            icon={Users}
          />
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/30 shadow-lg backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-xl">
          <StatCard
            label="Avg. workout duration"
            value={`${stats.avgDurationMinutes} min`}
            icon={Timer}
            tone="success"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-1 rounded-2xl border border-border/40 bg-card/30 shadow-lg backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-xl">
          <StatCard
            label="Currently in gym"
            value={today.filter((t) => !t.check_out_at).length}
            icon={Clock}
            tone="warning"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/30 p-1 shadow-lg backdrop-blur-xl">
        <ManualCheckInPanel />
      </div>

      {/* Charts & Streaks Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/40 bg-card/30 shadow-lg backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg">Peak hours (last 30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <PeakHoursChart data={stats.peakHours} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/30 p-5 shadow-lg backdrop-blur-xl">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Check-in Streaks</h3>
          <StreaksOverviewWidget topStreaks={streaks.topStreaks} atRisk={streaks.atRisk} />
        </div>
      </div>

      {/* Today's Members Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight">Today's members</h3>
          <span className="rounded-full bg-secondary/50 px-3 py-1 text-xs font-medium backdrop-blur-md">
            {today.length} {today.length === 1 ? 'Visit' : 'Visits'}
          </span>
        </div>

        {today.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center rounded-2xl border border-border/40 bg-card/30 shadow-lg backdrop-blur-xl">
            <p className="text-sm text-muted-foreground">No check-ins yet today.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/30 shadow-lg backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="border-b border-border/40 bg-secondary/20 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3.5 font-medium">Member</th>
                    <th className="px-5 py-3.5 font-medium">Check in</th>
                    <th className="px-5 py-3.5 font-medium">Check out</th>
                    <th className="px-5 py-3.5 font-medium">Duration</th>
                    <th className="px-5 py-3.5 font-medium">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {today.map((t) => (
                    <tr 
                      key={t.id} 
                      className="transition-colors hover:bg-muted/10 group"
                    >
                      <td className="px-5 py-4 font-medium flex items-center gap-2">
                        {t.member_name}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {format(new Date(t.check_in_at), "h:mm a")}
                      </td>
                      <td className="px-5 py-4">
                        {t.check_out_at ? (
                          <span className="text-muted-foreground">
                            {format(new Date(t.check_out_at), "h:mm a")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-success font-medium">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
                            </span>
                            In gym
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {t.duration_minutes != null
                          ? (
                            <span className="rounded-md bg-secondary/40 px-2 py-1 text-xs">
                              {t.duration_minutes} min
                            </span>
                          ) : "—"}
                      </td>
                      <td className="px-5 py-4 capitalize text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          {t.method}
                          {t.gps_verified && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              GPS
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}