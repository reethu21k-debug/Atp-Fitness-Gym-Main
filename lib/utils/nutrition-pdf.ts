import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { downloadBlob } from "./download-file";
import {
  calculateDailyTotals,
  calculateMealTotals,
  calculateNutrition,
  formatQuantity,
  ZERO_NUTRITION,
} from "@/lib/services/nutrition";
import type { NutritionPlanWithDetails } from "@/lib/actions/nutrition.actions";
import type { DietPlanWithDetails } from "@/lib/actions/trainer.actions";
import type { Gender } from "@/types/database";

/**
 * Client-side-only nutrition PDF export — mirrors exportReportToPdf() in
 * report-export.ts: built entirely from data already loaded on the page (no
 * server round trip), and downloaded via downloadBlob() for reliable saves
 * on both desktop and mobile browsers.
 *
 * Every section below only renders when the underlying data actually exists
 * -- no placeholder rows, no "N/A", no hardcoded content.
 */

export interface NutritionPdfClientInfo {
  name: string;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  heightCm?: number | null;
  weightKg?: number | null;
}

export interface NutritionPdfInput {
  gymName: string;
  client: NutritionPdfClientInfo;
  plans: NutritionPlanWithDetails[];
  legacyPlans?: DietPlanWithDetails[];
}

const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

function calculateAge(dateOfBirth: string): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : null;
}

function formatDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Ensures there's room for `needed` more points on the page before the next block; adds a page otherwise. */
function ensureSpace(doc: jsPDF, cursorY: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + needed > pageHeight - 40) {
    doc.addPage();
    return 44;
  }
  return cursorY;
}

function sectionHeading(doc: jsPDF, text: string, marginX: number, cursorY: number): number {
  cursorY = ensureSpace(doc, cursorY, 30);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20);
  doc.text(text, marginX, cursorY);
  doc.setDrawColor(230);
  doc.line(marginX, cursorY + 4, 555, cursorY + 4);
  return cursorY + 18;
}

export async function downloadNutritionPdf(input: NutritionPdfInput): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;
  let cursorY = 50;

  const hasNutritionPlans = input.plans.length > 0;
  const hasLegacyPlans = (input.legacyPlans?.length ?? 0) > 0;

  // --- Header -----------------------------------------------------------
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(input.gymName, marginX, cursorY);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(`Generated ${formatDate(new Date())}`, 555, cursorY, { align: "right" });

  cursorY += 18;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Nutrition Plan", marginX, cursorY);

  cursorY += 22;
  doc.setDrawColor(220);
  doc.line(marginX, cursorY, 555, cursorY);
  cursorY += 20;

  // --- Client info --------------------------------------------------------
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("CLIENT", marginX, cursorY);
  cursorY += 15;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(input.client.name, marginX, cursorY);
  cursorY += 16;

  const details: string[] = [];
  const age = input.client.dateOfBirth ? calculateAge(input.client.dateOfBirth) : null;
  if (age !== null) details.push(`${age} yrs`);
  if (input.client.gender) details.push(GENDER_LABELS[input.client.gender]);
  if (input.client.heightCm) details.push(`${input.client.heightCm} cm`);
  if (input.client.weightKg) details.push(`${input.client.weightKg} kg`);

  if (details.length) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text(details.join("  ·  "), marginX, cursorY);
    cursorY += 16;
  }

  cursorY += 8;

  if (!hasNutritionPlans && !hasLegacyPlans) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text("No nutrition data is available for this client yet.", marginX, cursorY);
    await downloadBlob(doc.output("blob"), `${fileSafe(input.client.name)}-nutrition-plan.pdf`);
    return;
  }

  // --- Nutrition module plans ---------------------------------------------
  for (const plan of input.plans) {
    cursorY = ensureSpace(doc, cursorY, 60);
    cursorY = sectionHeading(doc, plan.name || "Nutrition Plan", marginX, cursorY);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    const metaParts: string[] = [];
    if (plan.start_date) metaParts.push(`Starts ${formatDate(plan.start_date)}`);
    if (plan.duration_days) metaParts.push(`${plan.duration_days} days`);
    metaParts.push(plan.is_active ? "Active" : "Inactive");
    doc.text(metaParts.join("  ·  "), marginX, cursorY);
    cursorY += 16;

    // Targets table -- only rows with a real value
    const targetRows: (string | number)[][] = [];
    if (plan.calorie_target) targetRows.push(["Daily calories", `${plan.calorie_target} kcal`]);
    if (plan.protein_target_g) targetRows.push(["Protein", `${plan.protein_target_g} g`]);
    if (plan.carb_target_g) targetRows.push(["Carbohydrates", `${plan.carb_target_g} g`]);
    if (plan.fat_target_g) targetRows.push(["Fats", `${plan.fat_target_g} g`]);
    if (plan.fiber_target_g) targetRows.push(["Fiber", `${plan.fiber_target_g} g`]);
    if (plan.water_target_ml) targetRows.push(["Water intake", `${(plan.water_target_ml / 1000).toFixed(1)} L`]);
    if (plan.meal_frequency) targetRows.push(["Meals per day", String(plan.meal_frequency)]);

    if (targetRows.length) {
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: 40 },
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 4 },
        columnStyles: { 0: { textColor: 120 }, 1: { fontStyle: "bold", textColor: 0 } },
        body: targetRows,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cursorY = (doc as any).lastAutoTable.finalY + 14;
    }

    // Meals
    for (const meal of plan.meals) {
      if (!meal.items.length) continue;
      cursorY = ensureSpace(doc, cursorY, 40);
      doc.setFontSize(10.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text(meal.name, marginX, cursorY);
      cursorY += 6;

      const mealTotals = calculateMealTotals(meal.items);
      const rows = meal.items.map((item) => {
        const values = calculateNutrition(item.food, item.quantity, item.unit);
        return [
          item.food.name,
          formatQuantity(item.quantity, item.unit),
          `${values.calories} kcal`,
          `${values.proteinG} g`,
          `${values.carbsG} g`,
          `${values.fatG} g`,
        ];
      });

      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: 40 },
        theme: "striped",
        head: [["Food", "Qty", "Calories", "Protein", "Carbs", "Fat"]],
        body: rows,
        foot: [["Meal total", "", `${mealTotals.calories} kcal`, `${mealTotals.proteinG} g`, `${mealTotals.carbsG} g`, `${mealTotals.fatG} g`]],
        styles: { fontSize: 8.5, cellPadding: 5 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        footStyles: { fillColor: [245, 245, 245], textColor: 0, fontStyle: "bold" },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cursorY = (doc as any).lastAutoTable.finalY + 16;
    }

    // Daily totals across the whole plan, if it has more than one meal with items
    const mealsWithItems = plan.meals.filter((m) => m.items.length);
    if (mealsWithItems.length > 1) {
      const dailyTotals = calculateDailyTotals(mealsWithItems);
      if (JSON.stringify(dailyTotals) !== JSON.stringify(ZERO_NUTRITION)) {
        cursorY = ensureSpace(doc, cursorY, 24);
        doc.setFontSize(9.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text(
          `Plan daily total: ${dailyTotals.calories} kcal  ·  P ${dailyTotals.proteinG}g  ·  C ${dailyTotals.carbsG}g  ·  F ${dailyTotals.fatG}g`,
          marginX,
          cursorY
        );
        cursorY += 18;
      }
    }

    if (plan.notes && plan.notes.trim()) {
      cursorY = ensureSpace(doc, cursorY, 36);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(120);
      doc.text("TRAINER NOTES", marginX, cursorY);
      cursorY += 13;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30);
      const noteLines = doc.splitTextToSize(plan.notes.trim(), 515);
      doc.text(noteLines, marginX, cursorY);
      cursorY += noteLines.length * 12 + 10;
    }

    cursorY += 10;
  }

  // --- Legacy (pre-nutrition-module) diet plans ---------------------------
  for (const plan of input.legacyPlans ?? []) {
    cursorY = ensureSpace(doc, cursorY, 60);
    cursorY = sectionHeading(doc, plan.title || "Diet Plan", marginX, cursorY);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    const metaParts: string[] = [];
    if (plan.start_date) metaParts.push(`Starts ${formatDate(plan.start_date)}`);
    if (plan.end_date) metaParts.push(`Ends ${formatDate(plan.end_date)}`);
    metaParts.push(plan.is_active ? "Active" : "Inactive");
    doc.text(metaParts.join("  ·  "), marginX, cursorY);
    cursorY += 16;

    const targetRows: (string | number)[][] = [];
    if (plan.daily_calorie_target) targetRows.push(["Daily calories", `${plan.daily_calorie_target} kcal`]);
    if (plan.daily_protein_g) targetRows.push(["Protein", `${plan.daily_protein_g} g`]);
    if (plan.daily_carbs_g) targetRows.push(["Carbohydrates", `${plan.daily_carbs_g} g`]);
    if (plan.daily_fat_g) targetRows.push(["Fats", `${plan.daily_fat_g} g`]);

    if (targetRows.length) {
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: 40 },
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 4 },
        columnStyles: { 0: { textColor: 120 }, 1: { fontStyle: "bold", textColor: 0 } },
        body: targetRows,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cursorY = (doc as any).lastAutoTable.finalY + 14;
    }

    if (plan.meals.length) {
      const rows = plan.meals.map((meal) => [
        MEAL_TYPE_LABELS[meal.meal_type] ?? meal.meal_type,
        meal.items,
        meal.calories ? `${meal.calories} kcal` : "",
        meal.protein_g ? `${meal.protein_g} g` : "",
        meal.carbs_g ? `${meal.carbs_g} g` : "",
        meal.fat_g ? `${meal.fat_g} g` : "",
      ]);
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: 40 },
        theme: "striped",
        head: [["Meal", "Items", "Calories", "Protein", "Carbs", "Fat"]],
        body: rows,
        styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak" },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        columnStyles: { 1: { cellWidth: 180 } },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cursorY = (doc as any).lastAutoTable.finalY + 14;
    }

    if (plan.notes && plan.notes.trim()) {
      cursorY = ensureSpace(doc, cursorY, 36);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(120);
      doc.text("TRAINER NOTES", marginX, cursorY);
      cursorY += 13;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30);
      const noteLines = doc.splitTextToSize(plan.notes.trim(), 515);
      doc.text(noteLines, marginX, cursorY);
      cursorY += noteLines.length * 12 + 10;
    }

    cursorY += 10;
  }

  await downloadBlob(doc.output("blob"), `${fileSafe(input.client.name)}-nutrition-plan.pdf`);
}

function fileSafe(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "client";
}