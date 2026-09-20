import Link from "next/link";
import { getMyClients } from "@/lib/actions/trainer.actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MemberStatusBadge } from "@/components/features/members/status-badge";
import { UserPlus, Users, ChevronRight } from "lucide-react";

export const metadata = { title: "My Clients — ATP Fitness" };

export default async function TrainerClientsPage() {
  const clients = await getMyClients();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">My Clients</h1>
          <p className="text-sm text-muted-foreground">
            Members assigned to you — plans, diet, and progress.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto shadow-sm">
          <Link href="/dashboard/trainer/members/new">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Member
          </Link>
        </Button>
      </div>

      {clients.length === 0 ? (
        /* 
          Glassmorphic Empty State: 
          Uses low opacity background with a medium blur and dashed border.
        */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/20 px-6 py-16 text-center backdrop-blur-md animate-in fade-in-50 duration-700">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-background/50 backdrop-blur-sm shadow-sm border border-border/40">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mb-1 text-lg font-semibold tracking-tight">No clients assigned</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            You don't have any members assigned to you yet. Ask the gym owner or front desk to assign clients from a member's profile.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-6">
          {clients.map((c) => (
            <Link 
              key={c.profile_id} 
              href={`/dashboard/trainer/clients/${c.profile_id}`}
              className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {/* 
                Glassmorphic Card:
                - bg-card/40 & backdrop-blur-xl: Creates the frosted glass look
                - border-border/50: Subtle translucent edges
                - hover effects: Increases opacity slightly and adds a floating shadow
              */}
              <Card className="group h-full relative overflow-hidden bg-card/40 backdrop-blur-xl border-border/50 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:bg-card/60 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
                
                {/* Optional: Subtle ambient glow effect inside the card for more depth */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

                <CardContent className="relative z-10 flex items-center gap-4 p-5">
                  {/* Glass Avatar */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background/50 backdrop-blur-md text-sm font-medium text-primary shadow-sm ring-1 ring-border/40 transition-all duration-500 group-hover:ring-primary/30 group-hover:bg-primary/10">
                    {c.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatar_url} alt={c.full_name} className="h-full w-full object-cover" />
                    ) : (
                      c.full_name.charAt(0).toUpperCase()
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <p className="truncate text-base font-medium leading-tight transition-colors group-hover:text-primary">
                      {c.full_name}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {c.plan_name ?? "No active plan"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <MemberStatusBadge status={c.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-50 transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary group-hover:opacity-100" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}