"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requirePermission } from "@/lib/utils/permissions";
import type { ActionResult } from "./auth.actions";
import type {
  FoodCategory,
  FoodState,
  FoodUnit,
  FoodWithNutrition,
  NutritionMeal,
  NutritionMealItem,
  NutritionPlan,
} from "@/types/database";
import type { MealItemWithFood } from "@/lib/services/nutrition";

function revalidateClient(memberId: string) {
  revalidatePath(`/dashboard/trainer/clients/${memberId}`);
  revalidatePath("/dashboard/member/diet");
}

// ============================================================================
// FOOD SEARCH / BROWSE  (section 5, 6, 18 — fast, paginated, category-filterable)
// ============================================================================

export interface FoodSearchResult extends FoodWithNutrition {}

export async function searchFoods(query: string, category?: FoodCategory | "all", limit = 25): Promise<FoodSearchResult[]> {
  const supabase = await createClient();
  let q = supabase.from("foods").select("*, nutrition:food_nutrition(*)").order("name").limit(limit);

  if (query.trim()) q = q.ilike("name", `%${query.trim()}%`);
  if (category && category !== "all") q = q.eq("category", category);

  const { data } = await q;
  return normalizeFoodRows(data);
}

function normalizeFoodRows(rows: any[] | null): FoodSearchResult[] {
  return (rows ?? [])
    .map((row) => ({ ...row, nutrition: Array.isArray(row.nutrition) ? row.nutrition[0] : row.nutrition }))
    .filter((row) => !!row.nutrition) as FoodSearchResult[];
}

// ============================================================================
// QUICK ADD  (sections 7-11 — frequently used, favorites, recent, in one call)
// ============================================================================

export interface QuickAddData {
  frequentlyUsed: (FoodWithNutrition & { defaultQuantity: number; defaultUnit: FoodUnit })[];
  favorites: (FoodWithNutrition & { defaultQuantity: number; defaultUnit: FoodUnit; favoriteId: string })[];
  recent: (FoodWithNutrition & { defaultQuantity: number; defaultUnit: FoodUnit })[];
}

export async function getQuickAddData(): Promise<QuickAddData> {
  const profile = await getCurrentProfile();
  if (!profile) return { frequentlyUsed: [], favorites: [], recent: [] };

  const supabase = await createClient();

  const [{ data: frequent }, { data: favorites }, { data: recent }] = await Promise.all([
    supabase
      .from("trainer_food_usage")
      .select("food_id, usage_count, last_quantity, last_unit, food:foods(*, nutrition:food_nutrition(*))")
      .eq("trainer_id", profile.id)
      .order("usage_count", { ascending: false })
      .limit(8),
    supabase
      .from("trainer_favorite_foods")
      .select("id, food_id, default_quantity, default_unit, order_index, food:foods(*, nutrition:food_nutrition(*))")
      .eq("trainer_id", profile.id)
      .order("order_index"),
    supabase
      .from("trainer_food_usage")
      .select("food_id, last_quantity, last_unit, last_used_at, food:foods(*, nutrition:food_nutrition(*))")
      .eq("trainer_id", profile.id)
      .order("last_used_at", { ascending: false })
      .limit(8),
  ]);

  return {
    frequentlyUsed: (frequent ?? [])
      .filter((r: any) => r.food)
      .map((r: any) => ({ ...normalizeFoodRows([r.food])[0], defaultQuantity: r.last_quantity, defaultUnit: r.last_unit }))
      .filter((r: any) => r.nutrition) as QuickAddData["frequentlyUsed"],
    favorites: (favorites ?? [])
      .filter((r: any) => r.food)
      .map((r: any) => ({ ...normalizeFoodRows([r.food])[0], defaultQuantity: r.default_quantity, defaultUnit: r.default_unit, favoriteId: r.id }))
      .filter((r: any) => r.nutrition) as QuickAddData["favorites"],
    recent: (recent ?? [])
      .filter((r: any) => r.food)
      .map((r: any) => ({ ...normalizeFoodRows([r.food])[0], defaultQuantity: r.last_quantity, defaultUnit: r.last_unit }))
      .filter((r: any) => r.nutrition) as QuickAddData["recent"],
  };
}

// ============================================================================
// CUSTOM FOODS — trainer adds a food (and its nutrition) that isn't in the
// shared database yet. Scoped to the trainer's own gym (gym_id + created_by),
// matching the foods_write/foods_update/food_nutrition_write RLS policies.
// ============================================================================

export interface CreateCustomFoodInput {
  name: string;
  category: FoodCategory;
  state?: FoodState;
  defaultUnit: FoodUnit;
  basisQuantity: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
}

export async function createCustomFood(input: CreateCustomFoodInput): Promise<ActionResult<{ food: FoodWithNutrition }>> {
  const name = input.name.trim();
  if (!name) return { success: false, error: "Give the food a name." };
  if (!input.basisQuantity || input.basisQuantity <= 0) return { success: false, error: "Basis quantity must be greater than 0." };
  if ([input.calories, input.proteinG, input.carbsG, input.fatG].some((n) => n === undefined || n === null || Number.isNaN(n) || n < 0)) {
    return { success: false, error: "Nutrition values must be zero or positive numbers." };
  }

  try {
    await requirePermission("nutrition_plans", "create");
  } catch {
    return { success: false, error: "You do not have permission to add foods." };
  }

  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { success: false, error: "Your account isn't linked to a gym." };

  const supabase = await createClient();

  const { data: food, error: foodError } = await supabase
    .from("foods")
    .insert({
      name,
      category: input.category,
      state: input.state ?? "na",
      default_unit: input.defaultUnit,
      basis_quantity: input.basisQuantity,
      is_custom: true,
      gym_id: actor.gym_id,
      created_by: actor.id,
      source: "Trainer-added",
    })
    .select()
    .single();

  if (foodError || !food) return { success: false, error: "Could not save the food. It may already exist." };

  const { data: nutrition, error: nutritionError } = await supabase
    .from("food_nutrition")
    .insert({
      food_id: food.id,
      basis: input.defaultUnit === "ml" || input.defaultUnit === "l" ? "per_100ml" : input.defaultUnit === "g" || input.defaultUnit === "kg" ? "per_100g" : "per_piece",
      calories: input.calories,
      protein_g: input.proteinG,
      carbs_g: input.carbsG,
      fat_g: input.fatG,
      fiber_g: input.fiberG ?? null,
      source: "Trainer-added",
    })
    .select()
    .single();

  if (nutritionError || !nutrition) {
    // Roll back the orphaned food row so it doesn't show up without nutrition data.
    await supabase.from("foods").delete().eq("id", food.id);
    return { success: false, error: "Could not save nutrition values for this food." };
  }

  return { success: true, data: { food: { ...food, nutrition } as FoodWithNutrition } };
}

export async function toggleFavoriteFood(foodId: string, defaultQuantity: number, defaultUnit: FoodUnit): Promise<ActionResult<{ favorited: boolean }>> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, error: "Not signed in." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("trainer_favorite_foods")
    .select("id")
    .eq("trainer_id", profile.id)
    .eq("food_id", foodId)
    .maybeSingle();

  if (existing) {
    await supabase.from("trainer_favorite_foods").delete().eq("id", existing.id);
    return { success: true, data: { favorited: false } };
  }

  const { error } = await supabase
    .from("trainer_favorite_foods")
    .insert({ trainer_id: profile.id, food_id: foodId, default_quantity: defaultQuantity, default_unit: defaultUnit });
  if (error) return { success: false, error: "Could not save favorite." };
  return { success: true, data: { favorited: true } };
}

// ============================================================================
// NUTRITION PLANS (create / list / targets)
// ============================================================================

export interface CreateNutritionPlanInput {
  memberId: string;
  name: string;
  startDate: string;
  durationDays: number;
  calorieTarget?: number;
  proteinTargetG?: number;
  carbTargetG?: number;
  fatTargetG?: number;
  fiberTargetG?: number;
  waterTargetMl?: number;
  mealFrequency?: number;
  notes?: string;
}

const DEFAULT_MEALS = ["Breakfast", "Lunch", "Snack", "Dinner"];

export async function createNutritionPlan(input: CreateNutritionPlanInput): Promise<ActionResult<{ planId: string }>> {
  try {
    await requirePermission("nutrition_plans", "create");
  } catch {
    return { success: false, error: "You do not have permission to create nutrition plans." };
  }
  if (!input.name.trim()) return { success: false, error: "Give the plan a name." };

  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { success: false, error: "Your account isn't linked to a gym." };

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("nutrition_plans")
    .insert({
      gym_id: actor.gym_id,
      member_id: input.memberId,
      trainer_id: actor.id,
      name: input.name,
      start_date: input.startDate,
      duration_days: input.durationDays || 30,
      calorie_target: input.calorieTarget ?? null,
      protein_target_g: input.proteinTargetG ?? null,
      carb_target_g: input.carbTargetG ?? null,
      fat_target_g: input.fatTargetG ?? null,
      fiber_target_g: input.fiberTargetG ?? null,
      water_target_ml: input.waterTargetMl ?? null,
      meal_frequency: input.mealFrequency ?? null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (error || !plan) return { success: false, error: "Could not create the nutrition plan." };

  await supabase.from("nutrition_meals").insert(DEFAULT_MEALS.map((name, i) => ({ nutrition_plan_id: plan.id, name, order_index: i })));

  revalidateClient(input.memberId);
  return { success: true, data: { planId: plan.id } };
}

export interface UpdateNutritionTargetsInput {
  planId: string;
  memberId: string;
  name?: string;
  calorieTarget?: number | null;
  proteinTargetG?: number | null;
  carbTargetG?: number | null;
  fatTargetG?: number | null;
  fiberTargetG?: number | null;
  waterTargetMl?: number | null;
  mealFrequency?: number | null;
}

export async function updateNutritionTargets(input: UpdateNutritionTargetsInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("nutrition_plans")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      calorie_target: input.calorieTarget,
      protein_target_g: input.proteinTargetG,
      carb_target_g: input.carbTargetG,
      fat_target_g: input.fatTargetG,
      fiber_target_g: input.fiberTargetG,
      water_target_ml: input.waterTargetMl,
      meal_frequency: input.mealFrequency,
    })
    .eq("id", input.planId);
  if (error) return { success: false, error: "Could not update targets." };
  revalidateClient(input.memberId);
  return { success: true };
}

export async function deactivateNutritionPlan(planId: string, memberId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("nutrition_plans").update({ is_active: false }).eq("id", planId);
  if (error) return { success: false, error: "Could not update the plan." };
  revalidateClient(memberId);
  return { success: true };
}

export async function deleteNutritionPlan(planId: string, memberId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("nutrition_plans").delete().eq("id", planId);
  if (error) return { success: false, error: "Could not delete the plan." };
  revalidateClient(memberId);
  return { success: true };
}

/** Duplicates a plan (and all its meals/items) as a new version, keeping the original for history (section 14). */
export async function duplicateNutritionPlan(planId: string, memberId: string): Promise<ActionResult<{ planId: string }>> {
  const supabase = await createClient();
  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { success: false, error: "Your account isn't linked to a gym." };

  const { data: source } = await supabase.from("nutrition_plans").select("*").eq("id", planId).single();
  if (!source) return { success: false, error: "Plan not found." };

  const { data: newPlan, error } = await supabase
    .from("nutrition_plans")
    .insert({
      gym_id: source.gym_id,
      member_id: source.member_id,
      trainer_id: actor.id,
      name: `${source.name} (copy)`,
      start_date: new Date().toISOString().slice(0, 10),
      duration_days: source.duration_days,
      calorie_target: source.calorie_target,
      protein_target_g: source.protein_target_g,
      carb_target_g: source.carb_target_g,
      fat_target_g: source.fat_target_g,
      fiber_target_g: source.fiber_target_g,
      water_target_ml: source.water_target_ml,
      meal_frequency: source.meal_frequency,
      notes: source.notes,
      version: source.version + 1,
      parent_plan_id: source.parent_plan_id ?? source.id,
    })
    .select()
    .single();
  if (error || !newPlan) return { success: false, error: "Could not duplicate the plan." };

  const { data: meals } = await supabase.from("nutrition_meals").select("*").eq("nutrition_plan_id", planId).order("order_index");
  for (const meal of meals ?? []) {
    const { data: newMeal } = await supabase
      .from("nutrition_meals")
      .insert({ nutrition_plan_id: newPlan.id, name: meal.name, order_index: meal.order_index })
      .select()
      .single();
    if (!newMeal) continue;
    const { data: items } = await supabase.from("nutrition_meal_items").select("*").eq("meal_id", meal.id).order("order_index");
    if (items?.length) {
      await supabase
        .from("nutrition_meal_items")
        .insert(items.map((it) => ({ meal_id: newMeal.id, food_id: it.food_id, quantity: it.quantity, unit: it.unit, order_index: it.order_index })));
    }
  }

  revalidateClient(source.member_id);
  return { success: true, data: { planId: newPlan.id } };
}

// ============================================================================
// FETCH — full plan tree (plan + meals + items + food + nutrition), joined
// server-side so the client can call calculateDailyTotals() locally.
// ============================================================================

export interface NutritionMealWithItems extends NutritionMeal {
  items: MealItemWithFood[];
}
export interface NutritionPlanWithDetails extends NutritionPlan {
  meals: NutritionMealWithItems[];
}

export async function getNutritionPlans(memberId: string): Promise<NutritionPlanWithDetails[]> {
  const supabase = await createClient();
  // Single nested-select round trip instead of 3 sequential queries
  // (plans -> meals -> items+food+nutrition). Rows are sorted in JS since
  // embedded resources come back unordered by default.
  const { data: plans } = await supabase
    .from("nutrition_plans")
    .select("*, meals:nutrition_meals(*, items:nutrition_meal_items(*, food:foods(*, nutrition:food_nutrition(*))))")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  type RawItem = NutritionMealItem & { food: any };
  type RawMeal = NutritionMeal & { items: RawItem[] };
  type RawPlan = NutritionPlan & { meals: RawMeal[] };

  return ((plans ?? []) as unknown as RawPlan[]).map((plan) => ({
    ...plan,
    meals: (plan.meals ?? [])
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((meal) => ({
        ...meal,
        items: (meal.items ?? [])
          .slice()
          .sort((a, b) => a.order_index - b.order_index)
          .map((it): MealItemWithFood => ({
            ...it,
            food: { ...it.food, nutrition: Array.isArray(it.food?.nutrition) ? it.food.nutrition[0] : it.food?.nutrition },
          })),
      })),
  }));
}

// ============================================================================
// MEALS  (section 2 — add / rename / delete / reorder)
// ============================================================================

export async function addMeal(planId: string, memberId: string, name: string): Promise<ActionResult<{ mealId: string }>> {
  const supabase = await createClient();
  const { count } = await supabase.from("nutrition_meals").select("id", { count: "exact", head: true }).eq("nutrition_plan_id", planId);
  const { data, error } = await supabase
    .from("nutrition_meals")
    .insert({ nutrition_plan_id: planId, name: name || "New meal", order_index: count ?? 0 })
    .select()
    .single();
  if (error || !data) return { success: false, error: "Could not add meal." };
  revalidateClient(memberId);
  return { success: true, data: { mealId: data.id } };
}

export async function renameMeal(mealId: string, memberId: string, name: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("nutrition_meals").update({ name }).eq("id", mealId);
  if (error) return { success: false, error: "Could not rename meal." };
  revalidateClient(memberId);
  return { success: true };
}

export async function deleteMeal(mealId: string, memberId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("nutrition_meals").delete().eq("id", mealId);
  if (error) return { success: false, error: "Could not delete meal." };
  revalidateClient(memberId);
  return { success: true };
}

export async function reorderMeal(planId: string, memberId: string, mealId: string, direction: "up" | "down"): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: meals } = await supabase.from("nutrition_meals").select("*").eq("nutrition_plan_id", planId).order("order_index");
  if (!meals) return { success: false, error: "Meal not found." };
  const idx = meals.findIndex((m) => m.id === mealId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= meals.length) return { success: true };

  await Promise.all([
    supabase.from("nutrition_meals").update({ order_index: meals[swapIdx].order_index }).eq("id", meals[idx].id),
    supabase.from("nutrition_meals").update({ order_index: meals[idx].order_index }).eq("id", meals[swapIdx].id),
  ]);
  revalidateClient(memberId);
  return { success: true };
}

// ============================================================================
// MEAL ITEMS (foods within a meal) — section 5, 7, 8, 12 workflow
// ============================================================================

export interface AddMealItemInput {
  mealId: string;
  memberId: string;
  foodId: string;
  quantity: number;
  unit: FoodUnit;
}

export async function addMealItem(input: AddMealItemInput): Promise<ActionResult<{ itemId: string }>> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, error: "Not signed in." };

  const supabase = await createClient();
  const { count } = await supabase.from("nutrition_meal_items").select("id", { count: "exact", head: true }).eq("meal_id", input.mealId);
  const { data, error } = await supabase
    .from("nutrition_meal_items")
    .insert({ meal_id: input.mealId, food_id: input.foodId, quantity: input.quantity, unit: input.unit, order_index: count ?? 0 })
    .select()
    .single();
  if (error || !data) return { success: false, error: "Could not add food to meal." };

  // Fire-and-forget: keep "Frequently Used" / "Recent Foods" current for this trainer.
  await supabase.rpc("record_trainer_food_usage", {
    p_trainer_id: profile.id,
    p_food_id: input.foodId,
    p_quantity: input.quantity,
    p_unit: input.unit,
  });

  revalidateClient(input.memberId);
  return { success: true, data: { itemId: data.id } };
}

export async function updateMealItem(itemId: string, memberId: string, quantity: number, unit: FoodUnit): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("nutrition_meal_items").update({ quantity, unit }).eq("id", itemId);
  if (error) return { success: false, error: "Could not update quantity." };
  revalidateClient(memberId);
  return { success: true };
}

export async function removeMealItem(itemId: string, memberId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("nutrition_meal_items").delete().eq("id", itemId);
  if (error) return { success: false, error: "Could not remove food." };
  revalidateClient(memberId);
  return { success: true };
}

export async function duplicateMealItem(itemId: string, memberId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: item } = await supabase.from("nutrition_meal_items").select("*").eq("id", itemId).single();
  if (!item) return { success: false, error: "Food not found." };
  const { count } = await supabase.from("nutrition_meal_items").select("id", { count: "exact", head: true }).eq("meal_id", item.meal_id);
  const { error } = await supabase
    .from("nutrition_meal_items")
    .insert({ meal_id: item.meal_id, food_id: item.food_id, quantity: item.quantity, unit: item.unit, order_index: count ?? 0 });
  if (error) return { success: false, error: "Could not duplicate food." };
  revalidateClient(memberId);
  return { success: true };
}