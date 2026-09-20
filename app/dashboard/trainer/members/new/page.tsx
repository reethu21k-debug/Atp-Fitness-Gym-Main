import Link from "next/link";
import { MemberForm } from "@/components/features/members/member-form";
import { getMemberFormOptions } from "@/lib/actions/member.actions";
import { Button } from "@/components/ui/button";
import { ArrowLeft, UserPlus } from "lucide-react";

export const metadata = { title: "Add Member — ATP Fitness" };

export default async function NewTrainerMemberPage() {
  const { plans, trainers } = await getMemberFormOptions();

  return (
    <div className="relative mx-auto max-w-3xl space-y-8 animate-in fade-in-50 duration-500">
      {/* 
        Ambient Glass Background Glow:
        Provides a subtle gradient light source behind the frosted container.
      */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -top-10 left-1/2 -z-10 h-64 w-full max-w-xl -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" 
      />

      <div className="space-y-6">
        {/* UX Improvement: Easy back navigation */}
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 w-fit gap-2 text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
        >
          <Link href="/dashboard/trainer/clients">
            <ArrowLeft className="h-4 w-4" />
            Back to Clients
          </Link>
        </Button>

        {/* Enhanced Header with Icon */}
        <div className="flex items-start gap-4">
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-background/50 border border-border/40 shadow-sm backdrop-blur-md sm:flex">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Add a new member</h1>
            <p className="text-sm text-muted-foreground">
              Their account, login credentials, and welcome message are generated automatically.
            </p>
          </div>
        </div>
      </div>

      {/* 
        Glassmorphic Form Wrapper:
        Lifts the standard form into a beautifully styled frosted container 
        with responsive padding.
      */}
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-4 shadow-sm backdrop-blur-xl sm:p-8">
        <MemberForm 
          basePath="/dashboard/trainer/clients" 
          plans={plans} 
          trainers={trainers} 
        />
      </div>
    </div>
  );
}