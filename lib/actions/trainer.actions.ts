"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requirePermission } from "@/lib/utils/permissions";
import type { ActionResult } from "./auth.actions";
import type { PlanFrequency, MealType, WorkoutPlan, WorkoutDay, WorkoutExercise, DietPlan, DietMeal } from "@/types/database";

// ============================================================================
// MY CLIENTS (members assigned to the current trainer)
// ============================================================================
export async function getMyClients() {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("members_overview")
    .select("*")
    .eq("assigned_trainer_id", profile.id)
    .order("full_name");

  return data ?? [];
}

// ============================================================================
// WORKOUT PLANS
// ============================================================================
export interface WorkoutExerciseInput {
  exerciseName: string;
  sets?: number;
  reps?: string;
  weightKg?: number;
  videoUrl?: string;
  notes?: string;
}
export interface WorkoutDayInput {
  dayLabel: string;
  notes?: string;
  exercises: WorkoutExerciseInput[];
}
export interface CreateWorkoutPlanInput {
  memberId: string;
  title: string;
  frequency: PlanFrequency;
  startDate: string;
  endDate?: string;
  notes?: string;
  days: WorkoutDayInput[];
}

export async function createWorkoutPlan(input: CreateWorkoutPlanInput): Promise<ActionResult<{ planId: string }>> {
  try {
    await requirePermission("workout_plans", "create");
  } catch {
    return { success: false, error: "You do not have permission to create workout plans." };
  }

  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { success: false, error: "Your account isn't linked to a gym." };

  const supabase = await createClient();

  const { data: plan, error } = await supabase
    .from("workout_plans")
    .insert({
      gym_id: actor.gym_id,
      member_id: input.memberId,
      trainer_id: actor.id,
      title: input.title,
      frequency: input.frequency,
      start_date: input.startDate,
      end_date: input.endDate || null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (error || !plan) return { success: false, error: "Could not create the workout plan." };

  for (const [i, day] of input.days.entries()) {
    const { data: dayRow, error: dayError } = await supabase
      .from("workout_days")
      .insert({ workout_plan_id: plan.id, day_label: day.dayLabel, day_order: i, notes: day.notes || null })
      .select()
      .single();
    if (dayError || !dayRow) continue;

    if (day.exercises.length > 0) {
      await supabase.from("workout_exercises").insert(
        day.exercises.map((ex, j) => ({
          workout_day_id: dayRow.id,
          exercise_name: ex.exerciseName,
          sets: ex.sets ?? null,
          reps: ex.reps || null,
          weight_kg: ex.weightKg ?? null,
          video_url: ex.videoUrl || null,
          notes: ex.notes || null,
          order_index: j,
        }))
      );
    }
  }

  revalidatePath("/dashboard/trainer/workouts");
  revalidatePath("/dashboard/member/workout");
  return { success: true, data: { planId: plan.id } };
}

export async function deactivateWorkoutPlan(planId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("workout_plans").update({ is_active: false }).eq("id", planId);
  if (error) return { success: false, error: "Could not update the plan." };
  revalidatePath("/dashboard/trainer/workouts");
  return { success: true };
}

export interface WorkoutPlanWithDetails extends WorkoutPlan {
  days: (WorkoutDay & { exercises: WorkoutExercise[] })[];
}

export async function getWorkoutPlans(memberId: string): Promise<WorkoutPlanWithDetails[]> {
  const supabase = await createClient();
  // Single nested-select round trip instead of 3 sequential queries
  // (plans -> days -> exercises). Children are sorted in JS since embedded
  // resources come back unordered by default.
  const { data: plans } = await supabase
    .from("workout_plans")
    .select("*, days:workout_days(*, exercises:workout_exercises(*))")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  return ((plans ?? []) as unknown as (WorkoutPlan & { days: (WorkoutDay & { exercises: WorkoutExercise[] })[] })[]).map(
    (plan) => ({
      ...plan,
      days: (plan.days ?? [])
        .slice()
        .sort((a, b) => a.day_order - b.day_order)
        .map((d) => ({ ...d, exercises: (d.exercises ?? []).slice().sort((a, b) => a.order_index - b.order_index) })),
    })
  );
}

// ============================================================================
// DIET PLANS
// ============================================================================
export interface DietMealInput {
  mealType: MealType;
  items: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}
export interface CreateDietPlanInput {
  memberId: string;
  title: string;
  startDate: string;
  endDate?: string;
  dailyCalorieTarget?: number;
  dailyProteinG?: number;
  dailyCarbsG?: number;
  dailyFatG?: number;
  notes?: string;
  meals: DietMealInput[];
}

export async function createDietPlan(input: CreateDietPlanInput): Promise<ActionResult<{ planId: string }>> {
  try {
    await requirePermission("diet_plans", "create");
  } catch {
    return { success: false, error: "You do not have permission to create diet plans." };
  }

  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { success: false, error: "Your account isn't linked to a gym." };

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("diet_plans")
    .insert({
      gym_id: actor.gym_id,
      member_id: input.memberId,
      trainer_id: actor.id,
      title: input.title,
      start_date: input.startDate,
      end_date: input.endDate || null,
      daily_calorie_target: input.dailyCalorieTarget ?? null,
      daily_protein_g: input.dailyProteinG ?? null,
      daily_carbs_g: input.dailyCarbsG ?? null,
      daily_fat_g: input.dailyFatG ?? null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (error || !plan) return { success: false, error: "Could not create the diet plan." };

  if (input.meals.length > 0) {
    await supabase.from("diet_meals").insert(
      input.meals.map((m, i) => ({
        diet_plan_id: plan.id,
        meal_type: m.mealType,
        items: m.items,
        calories: m.calories ?? null,
        protein_g: m.proteinG ?? null,
        carbs_g: m.carbsG ?? null,
        fat_g: m.fatG ?? null,
        order_index: i,
      }))
    );
  }

  revalidatePath("/dashboard/trainer/diets");
  revalidatePath("/dashboard/member/diet");
  return { success: true, data: { planId: plan.id } };
}

export interface DietPlanWithDetails extends DietPlan {
  meals: DietMeal[];
}

export async function getDietPlans(memberId: string): Promise<DietPlanWithDetails[]> {
  const supabase = await createClient();
  // Single nested-select round trip instead of 2 sequential queries.
  const { data: plans } = await supabase
    .from("diet_plans")
    .select("*, meals:diet_meals(*)")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  return ((plans ?? []) as unknown as (DietPlan & { meals: DietMeal[] })[]).map((plan) => ({
    ...plan,
    meals: (plan.meals ?? []).slice().sort((a, b) => a.order_index - b.order_index),
  }));
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================
export interface AddProgressInput {
  memberId: string;
  recordedAt: string;
  weightKg?: number;
  bodyFatPct?: number;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  armsCm?: number;
  thighsCm?: number;
  notes?: string;
}

export async function addProgressEntry(input: AddProgressInput): Promise<ActionResult> {
  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { success: false, error: "Your account isn't linked to a gym." };

  const supabase = await createClient();
  const { error } = await supabase.from("member_progress").insert({
    gym_id: actor.gym_id,
    member_id: input.memberId,
    recorded_at: input.recordedAt,
    weight_kg: input.weightKg ?? null,
    body_fat_pct: input.bodyFatPct ?? null,
    chest_cm: input.chestCm ?? null,
    waist_cm: input.waistCm ?? null,
    hips_cm: input.hipsCm ?? null,
    arms_cm: input.armsCm ?? null,
    thighs_cm: input.thighsCm ?? null,
    notes: input.notes || null,
    recorded_by: actor.id,
  });
  if (error) return { success: false, error: "Could not save this progress entry." };

  revalidatePath("/dashboard/trainer/clients");
  revalidatePath("/dashboard/member");
  return { success: true };
}

export async function getProgressHistory(memberId: string, range: "week" | "month" | "year" = "year") {
  const supabase = await createClient();
  const days = range === "week" ? 84 : range === "month" ? 365 : 365 * 3; // ~12 weeks / 12 months / 3 years of data
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("member_progress")
    .select("*")
    .eq("member_id", memberId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true });

  return data ?? [];
}

export async function getMemberHeightCm(memberId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("member_details").select("height_cm").eq("profile_id", memberId).single();
  return data?.height_cm ?? null;
}