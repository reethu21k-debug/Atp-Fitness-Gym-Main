"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { MemberStreak } from "@/types/database";
import { Flame, Trophy, ShieldCheck, ShieldAlert } from "lucide-react";

export function StreakCard({ streak }: { streak: MemberStreak | null }) {
  const current = streak?.current_streak ?? 0;
  const longest = streak?.longest_streak ?? 0;
  const graceAvailable = streak != null && current > 0 && !streak.grace_used;
  
  const isActive = current > 0;

  return (
    <Card 
      className={`relative overflow-hidden border backdrop-blur-xl shadow-lg transition-all duration-500 ${
        isActive
          ? "border-orange-500/30 bg-orange-500/5 shadow-orange-500/5"
          : "border-border/40 bg-card/30 hover:bg-card/40 hover:shadow-xl"
      }`}
    >
      {/* Ambient background glow for active streak */}
      {isActive && (
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-orange-500/20 blur-3xl animate-pulse" />
      )}

      <CardContent className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-5 p-6 sm:p-8">
        
        {/* Flame Icon Container */}
        <div 
          className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full transition-colors duration-500 ${
            isActive 
              ? "bg-orange-500/15 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.2)]" 
              : "border border-border/50 bg-secondary/40 text-muted-foreground shadow-inner"
          }`}
        >
          {isActive && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-20"></span>
          )}
          <Flame className={`h-8 w-8 ${isActive ? "drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]" : ""}`} />
        </div>

        {/* Typography & Stats */}
        <div className="flex-1 space-y-2">
          <div className="space-y-1">
            <h3 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              {current} <span className="text-xl sm:text-2xl font-semibold text-muted-foreground">{current === 1 ? "day" : "days"}</span>
            </h3>
            <p className="text-sm font-medium text-muted-foreground">
              {isActive ? "Current check-in streak" : "No active streak — check in to ignite it"}
            </p>
          </div>

          {/* Frosted Status Pills */}
          <div className="mt-3 flex flex-wrap items-center gap-2.5 pt-1">
            
            {/* Longest Streak Pill */}
            <span className="flex items-center gap-1.5 rounded-full border border-border/40 bg-background/50 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-md">
              <Trophy className={`h-3.5 w-3.5 ${longest > 0 ? "text-yellow-500" : "text-muted-foreground"}`} /> 
              Best: {longest} {longest === 1 ? "day" : "days"}
            </span>
            
            {/* Grace Day Pill */}
            {isActive && (
              <span 
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-md transition-colors ${
                  graceAvailable
                    ? "border-success/20 bg-success/10 text-success"
                    : "border-border/40 bg-secondary/40 text-muted-foreground"
                }`}
              >
                {graceAvailable ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" /> 1 grace day available
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3.5 w-3.5 opacity-50" /> Grace day used
                  </>
                )}
              </span>
            )}
          </div>
        </div>
        
      </CardContent>
    </Card>
  );
}