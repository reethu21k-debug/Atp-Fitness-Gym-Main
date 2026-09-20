import Link from "next/link";
import { notFound } from "next/navigation";
import { getMember } from "@/lib/actions/member.actions";
import { 
  getWorkoutPlans, 
  getDietPlans, 
  getProgressHistory, 
  getMemberHeightCm 
} from "@/lib/actions/trainer.actions";
import { getNutritionPlans } from "@/lib/actions/nutrition.actions";
import { getCurrentGymName } from "@/lib/utils/permissions";
import { ClientWorkspace } from "@/components/features/trainer/client-workspace";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string }>;
}

// UX: Dynamic tab title matching the current client's name
export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const member = await getMember(id);
  if (!member) return { title: "Client Not Found — ATP Fitness" };
  return { title: `${member.full_name} — Client Profile | ATP Fitness` };
}

export default async function TrainerClientDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [member, workoutPlans, dietPlans, nutritionPlans, progress, heightCm, gymName] = 
    await Promise.all([
      getMember(id),
      getWorkoutPlans(id),
      getDietPlans(id),
      getNutritionPlans(id),
      getProgressHistory(id, "year"),
      getMemberHeightCm(id),
      getCurrentGymName(),
    ]);

  if (!member) notFound();

  return (
    <div className="relative min-h-screen space-y-6 pb-12 animate-in fade-in-50 duration-500">
      {/* 
        Glassmorphic Ambient Background Glow:
        Provides subtle back-light so frosted glass elements in the workspace pop.
      */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -top-12 left-1/2 -z-10 h-80 w-full max-w-5xl -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" 
      />

      {/* 
        Sticky Glass Navigation Header & Breadcrumb:
        Keeps quick return navigation easily accessible on mobile and desktop.
      */}
      <header className="sticky top-0 z-30 -mx-4 border-b border-border/40 bg-background/60 px-4 py-3 backdrop-blur-xl transition-all sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-8 gap-1 px-2.5 text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
          >
            <Link href="/dashboard/trainer/clients">
              <ArrowLeft className="h-4 w-4" />
              <span>Clients</span>
            </Link>
          </Button>

          <ChevronRight className="h-3.5 w-3.5 opacity-40" />

          <span className="truncate font-medium text-foreground">
            {member.full_name}
          </span>
        </div>
      </header>

      {/* Main Workspace Wrapper */}
      <main className="relative z-10">
        <ClientWorkspace
          member={member}
          heightCm={heightCm}
          workoutPlans={workoutPlans}
          dietPlans={dietPlans}
          nutritionPlans={nutritionPlans}
          progress={progress}
          gymName={gymName}
        />
      </main>
    </div>
  );
}