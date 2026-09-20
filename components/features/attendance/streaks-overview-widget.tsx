"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemberStreakOverviewRow } from "@/types/database";
import { Flame, AlertTriangle, Trophy, Activity } from "lucide-react";

function MemberRow({ row, showRisk }: { row: MemberStreakOverviewRow; showRisk?: boolean }) {
  return (
    <div className="group flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/20">
      <span className="truncate pr-3 text-sm font-medium text-foreground">
        {row.member_name}
      </span>
      
      <div className="flex shrink-0 items-center gap-2">
        {showRisk && (
          <span className="flex max-w-[130px] sm:max-w-none items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning backdrop-blur-md">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {row.days_since_checkin === 1 ? "Missed yesterday" : `${row.days_since_checkin}d since visit`}
              {row.grace_used ? " · no grace" : ""}
            </span>
          </span>
        )}
        
        <span className="flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-500 shadow-sm backdrop-blur-md transition-transform group-hover:scale-105">
          <Flame className="h-3.5 w-3.5 drop-shadow-[0_0_5px_rgba(249,115,22,0.6)]" /> 
          {row.current_streak}
        </span>
      </div>
    </div>
  );
}

export function StreaksOverviewWidget({
  topStreaks,
  atRisk,
}: {
  topStreaks: MemberStreakOverviewRow[];
  atRisk: MemberStreakOverviewRow[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      
      {/* Top Streaks Card */}
      <Card className="relative overflow-hidden border border-border/40 bg-card/30 shadow-lg backdrop-blur-xl transition-all hover:bg-card/40">
        {/* Subtle background glow */}
        <div className="absolute -left-16 -top-16 h-32 w-32 rounded-full bg-orange-500/10 blur-3xl" />
        
        <CardHeader className="relative z-10 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
              <Trophy className="h-3.5 w-3.5" />
            </div>
            Top streaks
          </CardTitle>
        </CardHeader>
        <CardContent className="relative z-10">
          {topStreaks.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border/40 bg-secondary/20 backdrop-blur-sm">
              <Activity className="mb-2 h-6 w-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">No active streaks yet.</p>
            </div>
          ) : (
            <div className="-mx-3 flex flex-col space-y-0.5">
              {topStreaks.map((row) => (
                <MemberRow key={row.member_id} row={row} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Streaks At Risk Card */}
      <Card className="relative overflow-hidden border border-border/40 bg-card/30 shadow-lg backdrop-blur-xl transition-all hover:bg-card/40">
        {/* Subtle background glow */}
        <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-warning/10 blur-3xl" />

        <CardHeader className="relative z-10 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-warning/10 text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
            Streaks at risk
          </CardTitle>
        </CardHeader>
        <CardContent className="relative z-10">
          {atRisk.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border/40 bg-secondary/20 backdrop-blur-sm">
              <Trophy className="mb-2 h-6 w-6 text-success/50" />
              <p className="text-xs text-muted-foreground">All streaks are safe!</p>
            </div>
          ) : (
            <div className="-mx-3 flex flex-col space-y-0.5">
              {atRisk.map((row) => (
                <MemberRow key={row.member_id} row={row} showRisk />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
    </div>
  );
}