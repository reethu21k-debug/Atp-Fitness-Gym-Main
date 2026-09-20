"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole, getCurrentProfile, PermissionError } from "@/lib/utils/permissions";
import { staffFormSchema, type StaffFormInput } from "@/lib/validations/staff";
import { sendEmail, staffWelcomeEmailHtml, staffWelcomeEmailText } from "@/lib/services/email";
import { sendStaffWelcomeWhatsApp } from "@/lib/services/whatsapp";
import type { ActionResult } from "./auth.actions";
import type { Profile } from "@/types/database";

function generateTemporaryPassword() {
  const raw = crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "");
  return `${raw.slice(0, 10)}#7`;
}

// ============================================================================
// LIST STAFF (trainers + receptionists) FOR THE OWNER'S CURRENT ACTIVE BRANCH
// ============================================================================
export async function listBranchStaff(role?: "trainer" | "receptionist"): Promise<ActionResult<Profile[]>> {
  try {
    await requireRole("gym_owner");
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : "Not authenticated." };
  }

  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { success: false, error: "Your account isn't linked to a gym." };

  const supabase = await createClient();
  let query = supabase.from("profiles").select("*").eq("gym_id", actor.gym_id).order("full_name");

  if (role) query = query.eq("role", role);
  else query = query.in("role", ["trainer", "receptionist"]);

  const { data, error } = await query;
  if (error) return { success: false, error: "Could not load staff." };
  return { success: true, data: (data ?? []) as Profile[] };
}

// ============================================================================
// CREATE STAFF (trainer / receptionist) — same automatic account creation
// pattern as createMember: random password, forced reset, email + WhatsApp
// welcome, best-effort delivery.
// ============================================================================
export async function createStaffMember(input: StaffFormInput): Promise<ActionResult<{ staffId: string }>> {
  const parsed = staffFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] = issue.message;
    return { success: false, error: "Please check the form for errors.", fieldErrors };
  }

  try {
    await requireRole("gym_owner");
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : "Not authenticated." };
  }

  const actor = await getCurrentProfile();
  if (!actor?.tenant_id || !actor.gym_id) {
    return { success: false, error: "Your account isn't linked to a gym." };
  }

  const data = parsed.data;
  const admin = createAdminClient();

  const { data: gym } = await admin.from("gyms").select("name").eq("id", actor.gym_id).single();
  const temporaryPassword = generateTemporaryPassword();

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    phone: data.phone,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: data.fullName, role: data.role },
  });
  if (authError || !authUser.user) {
    return {
      success: false,
      error: authError?.message?.includes("already been registered")
        ? "A staff account with this email already exists."
        : "Could not create the staff account.",
    };
  }

  const staffId = authUser.user.id;

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      tenant_id: actor.tenant_id,
      gym_id: actor.gym_id,
      role: data.role,
      full_name: data.fullName,
      phone: data.phone,
      avatar_url: data.photoUrl ?? null,
      must_reset_password: true,
    })
    .eq("id", staffId);

  if (profileError) {
    await admin.auth.admin.deleteUser(staffId);
    return { success: false, error: "Could not finish setting up the staff profile." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const gymName = gym?.name ?? "your gym";
  const roleLabel = data.role === "trainer" ? "Trainer" : "Receptionist";

  await Promise.allSettled([
    sendEmail({
      to: data.email,
      subject: `Welcome to ${gymName} — your account is ready`,
      html: staffWelcomeEmailHtml({
        staffName: data.fullName,
        gymName,
        role: roleLabel,
        email: data.email,
        temporaryPassword,
        loginUrl: `${appUrl}/login`,
      }),
      text: staffWelcomeEmailText({
        staffName: data.fullName,
        gymName,
        role: roleLabel,
        email: data.email,
        temporaryPassword,
        loginUrl: `${appUrl}/login`,
      }),
    }),
    // Direct to Meta's Cloud API — no Twilio relay. Uses an approved template
    // when WHATSAPP_STAFF_WELCOME_TEMPLATE is set.
    sendStaffWelcomeWhatsApp({
      phone: data.phone,
      staffName: data.fullName,
      gymName,
      role: roleLabel,
      email: data.email,
      temporaryPassword,
      loginUrl: `${appUrl}/login`,
    }),
  ]);

  revalidatePath("/dashboard/owner/trainers");
  return { success: true, data: { staffId } };
}

// ============================================================================
// DEACTIVATE / REACTIVATE STAFF (soft — never deletes; preserves history on
// workout plans, payments processed, attendance checked in, etc.)
// ============================================================================
export async function setStaffActive(staffId: string, isActive: boolean): Promise<ActionResult> {
  try {
    await requireRole("gym_owner");
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : "Not authenticated." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", staffId);
  if (error) return { success: false, error: "Could not update the staff member." };

  revalidatePath("/dashboard/owner/trainers");
  return { success: true };
}