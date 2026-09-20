import { RenewalsPanel } from "@/components/features/members/renewals-panel";
import { hasPermission } from "@/lib/utils/permissions";
import { CalendarClock } from "lucide-react";

export const metadata = { title: "Renewals — ATP Fitness" };

export default async function TrainerRenewalsPage() {
  const canRemind = await hasPermission("members", "update");

  return (
    <div className="relative space-y-8 animate-in fade-in-50 duration-500">
      {/* 
        Ambient Glass Glow:
        Casts a soft, primary-tinted light behind the renewals panel for depth.
      */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -top-12 left-1/4 -z-10 h-72 w-full max-w-3xl -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" 
      />

      {/* Enhanced Responsive Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Glassmorphic Icon Badge (hidden on mobile to save vertical space) */}
        <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border/40 bg-background/50 shadow-sm backdrop-blur-md transition-transform hover:scale-105 sm:flex">
          <CalendarClock className="h-5 w-5 text-primary" />
        </div>
        
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Renewals</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Members expiring in the next 10 days, and members whose memberships have already lapsed.
          </p>
        </div>
      </div>

      {/* 
        Glassmorphic Container Bezel:
        Acts as a frosted frame around the RenewalsPanel, ensuring it feels 
        integrated into the new depth-based design system.
      */}
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-2 shadow-sm backdrop-blur-xl sm:p-4">
        <RenewalsPanel 
          memberDetailPath="/dashboard/trainer/clients" 
          canRemind={canRemind} 
        />
      </div>
    </div>
  );
}