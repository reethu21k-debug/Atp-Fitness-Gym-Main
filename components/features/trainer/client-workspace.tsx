"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { WorkoutPlanDialog } from "./workout-plan-dialog";
import { ProgressEntryDialog } from "./progress-entry-dialog";
import { ProgressChart } from "./progress-chart";
import { NutritionPanel } from "./nutrition/nutrition-panel";
import type { WorkoutPlanWithDetails, DietPlanWithDetails } from "@/lib/actions/trainer.actions";
import type { NutritionPlanWithDetails } from "@/lib/actions/nutrition.actions";
import { calculateBmi } from "@/lib/utils/fitness";
import type { MembersOverviewRow, MemberProgress } from "@/types/database";
import { PlayCircle, Dumbbell } from "lucide-react";

const TABS = ["Workouts", "Nutrition", "Progress"] as const;
type Tab = (typeof TABS)[number];

export function ClientWorkspace({
  member, heightCm, workoutPlans, dietPlans, nutritionPlans, progress, gymName,
}: {
  member: MembersOverviewRow;
  heightCm: number | null;
  workoutPlans: WorkoutPlanWithDetails[];
  dietPlans: DietPlanWithDetails[];
  nutritionPlans: NutritionPlanWithDetails[];
  progress: MemberProgress[];
  gymName: string;
}) {
  const [tab, setTab] = useState<Tab>("Workouts");
  const latestWeight = progress.length > 0 ? progress[progress.length - 1]?.weight_kg ?? null : null;
  const bmi = latestWeight && heightCm ? calculateBmi(latestWeight, heightCm) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg font-medium text-primary">
          {member.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.avatar_url} alt={member.full_name} className="h-full w-full object-cover" />
          ) : (
            member.full_name.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{member.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {member.plan_name ?? "No active plan"} {bmi && `· BMI ${bmi}`}
          </p>
        </div>
      </div>

      <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-md px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-background shadow-soft" : "text-muted-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Workouts" && (
        <div className="space-y-4">
          <div className="flex justify-end"><WorkoutPlanDialog memberId={member.profile_id} /></div>
          {workoutPlans.length === 0 ? (
            <EmptyState icon={Dumbbell} text="No workout plans yet." />
          ) : (
            workoutPlans.map((plan) => (
              <Card key={plan.id}>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{plan.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{plan.frequency} · from {format(new Date(plan.start_date), "dd MMM yyyy")}</p>
                    </div>
                    {!plan.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>}
                  </div>
                  <div className="space-y-3">
                    {plan.days.map((day) => (
                      <div key={day.id} className="rounded-lg border p-3">
                        <p className="mb-2 text-sm font-medium">{day.day_label}</p>
                        <div className="space-y-1">
                          {day.exercises.map((ex) => (
                            <div key={ex.id} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                              <span className="break-words">{ex.exercise_name}</span>
                              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                                {ex.sets && `${ex.sets} sets`} {ex.reps && `× ${ex.reps}`} {ex.weight_kg && `@ ${ex.weight_kg}kg`}
                                {ex.video_url && <a href={ex.video_url} target="_blank" rel="noreferrer"><PlayCircle className="h-3.5 w-3.5 text-primary" /></a>}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "Nutrition" && (
        <NutritionPanel
          memberId={member.profile_id}
          nutritionPlans={nutritionPlans}
          legacyDietPlans={dietPlans}
          gymName={gymName}
          client={{
            name: member.full_name,
            dateOfBirth: member.date_of_birth,
            gender: member.gender,
            heightCm,
            weightKg: latestWeight,
          }}
        />
      )}

      {tab === "Progress" && (
        <div className="space-y-4">
          <div className="flex justify-end"><ProgressEntryDialog memberId={member.profile_id} /></div>
          <Card><CardContent className="p-5"><ProgressChart entries={progress} /></CardContent></Card>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
      <Icon className="h-6 w-6" />
      <p className="text-sm">{text}</p>
    </div>
  );
}