"use server";

import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission, requireRole, getCurrentProfile, PermissionError } from "@/lib/utils/permissions";
import { memberFormSchema, type MemberFormInput } from "@/lib/validations/member";
import {
  sendEmail,
  memberWelcomeEmailHtml,
  memberWelcomeEmailText,
  subscriptionConfirmationEmailHtml,
  subscriptionConfirmationEmailText,
} from "@/lib/services/email";
import { sendMemberWelcomeWhatsApp } from "@/lib/services/whatsapp";
import { generateInvoicePdfBuffer } from "@/lib/services/invoice-pdf";
import { uploadBufferToCloudinary } from "@/lib/services/cloudinary";
import { buildInvoiceDownloadUrl } from "@/lib/services/invoice-links";
import { notifyActivationIfPaid } from "@/lib/services/subscription-lifecycle";
import { lifecycleLog } from "@/lib/services/logger";
import { addDaysToDateString } from "@/lib/utils/datetime";
import type { ActionResult } from "./auth.actions";
import type { PaymentMethod } from "@/types/database";

function generateTemporaryPassword() {
  // 12 chars, mixed case + digits + symbol — meets typical strength requirements.
  const raw = crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "");
  return `${raw.slice(0, 10)}#7`;
}

// Shared, timezone-safe calendar arithmetic. The previous local version applied
// the *local* setDate() to a UTC-midnight Date and reformatted with
// toISOString(), shifting end dates by a day on hosts west of UTC.
const addDays = addDaysToDateString;

// ============================================================================
// CREATE MEMBER — the "automatic account creation" flow from the spec:
// creates the auth user, a random password, sends email + WhatsApp, and
// forces a password reset on first login.
// ============================================================================
export async function createMember(input: MemberFormInput): Promise<ActionResult<{ memberId: string }>> {
  const parsed = memberFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] = issue.message;
    return { success: false, error: "Please check the form for errors.", fieldErrors };
  }

  try {
    await requirePermission("members", "create");
  } catch {
    return { success: false, error: "You do not have permission to add members." };
  }

  const actor = await getCurrentProfile();
  if (!actor?.tenant_id || !actor.gym_id) {
    return { success: false, error: "Your account isn't linked to a gym." };
  }

  const data = parsed.data;
  const admin = createAdminClient();

  // Look up the gym + plan for the welcome message and end-date calculation.
  const { data: gym } = await admin.from("gyms").select("name").eq("id", actor.gym_id).single();
  const { data: plan } = await admin
    .from("membership_plans")
    .select("name, duration_days")
    .eq("id", data.planId)
    .single();
  if (!plan) return { success: false, error: "Selected membership plan was not found." };

  const temporaryPassword = generateTemporaryPassword();

  // 1. Create the auth user (auto account creation).
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    phone: data.phone,
    password: temporaryPassword,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { full_name: data.fullName, role: "member" },
  });
  if (authError || !authUser.user) {
    if (authError) console.error("createMember: auth.admin.createUser failed:", authError.message);
    const msg = (authError?.message ?? "").toLowerCase();
    const isDuplicate = msg.includes("already registered") || msg.includes("already exists");
    if (isDuplicate && msg.includes("phone")) {
      return {
        success: false,
        error: "A member with this phone number already exists.",
        fieldErrors: { phone: "This phone number is already registered to another account." },
      };
    }
    if (isDuplicate) {
      return {
        success: false,
        error: "A member with this email already exists.",
        fieldErrors: { email: "This email is already registered to another account." },
      };
    }
    return { success: false, error: "Could not create the member's account." };
  }

  const memberId = authUser.user.id;

  // 2. Attach profile to this tenant/gym (row already exists via the
  //    handle_new_auth_user trigger — we fill in the rest and force a reset).
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      tenant_id: actor.tenant_id,
      gym_id: actor.gym_id,
      full_name: data.fullName,
      phone: data.phone,
      avatar_url: data.photoUrl ?? null,
      must_reset_password: true,
    })
    .eq("id", memberId);

  if (profileError) {
    await admin.auth.admin.deleteUser(memberId);
    return { success: false, error: "Could not finish setting up the member profile." };
  }

  // 3. Member details.
  const { error: detailsError } = await admin.from("member_details").insert({
    profile_id: memberId,
    gym_id: actor.gym_id,
    date_of_birth: data.dateOfBirth || null,
    gender: data.gender || null,
    address: data.address || null,
    emergency_contact_name: data.emergencyContactName || null,
    emergency_contact_phone: data.emergencyContactPhone || null,
    blood_group: data.bloodGroup,
    medical_conditions: data.medicalConditions || null,
    height_cm: data.heightCm ?? null,
    weight_kg: data.weightKg ?? null,
    joining_date: data.joiningDate,
    assigned_trainer_id: data.trainerId || null,
  });
  if (detailsError) {
    await admin.auth.admin.deleteUser(memberId);
    return { success: false, error: "Could not save the member's details." };
  }

  // 4. First membership period.
  const endDate = addDays(data.startDate, plan.duration_days);
  const { data: membership, error: membershipError } = await admin
    .from("member_memberships")
    .insert({
      member_id: memberId,
      gym_id: actor.gym_id,
      plan_id: data.planId,
      start_date: data.startDate,
      end_date: endDate,
      amount: data.amount,
      discount_amount: data.discountAmount,
      amount_paid: data.amountPaid,
      payment_status: data.paymentStatus,
      trainer_id: data.trainerId || null,
      is_current: true,
      created_by: actor.id,
    })
    .select()
    .single();
  if (membershipError || !membership) {
    return { success: false, error: "Member was created, but the membership record failed to save." };
  }

  lifecycleLog.info("SUBSCRIPTION_CREATED", {
    membershipId: membership.id,
    memberId,
    gymId: actor.gym_id,
    source: "new_member",
  });

  // 4b. Record the initial payment (if anything was collected up front) and
  //     generate a PDF invoice for it — this is what the "Download Invoice"
  //     button in the subscription confirmation email (step 6) links to.
  //     Best-effort: a failure here should never block member creation.
  let initialInvoiceUrl: string | null = null;
  let initialPaymentDate: string | null = null;
  // NOTE: the member form/validation schema (lib/validations/member.ts) should
  // collect a `paymentMethod` field alongside `amountPaid` so the receipt and
  // confirmation email reflect how the member actually paid. Falls back to
  // "cash" until that field is added.
  const paymentMethod: PaymentMethod = ((data as { paymentMethod?: PaymentMethod }).paymentMethod ?? "cash");

  if (data.amountPaid > 0) {
    const [{ data: invoiceNumber }, { data: receiptNumber }] = await Promise.all([
      admin.rpc("next_invoice_number", { p_gym_id: actor.gym_id }),
      admin.rpc("next_receipt_number", { p_gym_id: actor.gym_id }),
    ]);

    if (invoiceNumber && receiptNumber) {
      const { data: paymentRow, error: paymentError } = await admin
        .from("payments")
        .insert({
          gym_id: actor.gym_id,
          member_id: memberId,
          membership_id: membership.id,
          amount: data.amountPaid,
          gst_rate: 0,
          gst_amount: 0,
          total_amount: data.amountPaid,
          method: paymentMethod,
          invoice_number: invoiceNumber,
          receipt_number: receiptNumber,
          notes: "Initial membership payment recorded at signup",
          created_by: actor.id,
        })
        .select()
        .single();

      if (paymentError) {
        console.error("createMember: failed to record initial payment:", paymentError.message);
      } else if (paymentRow) {
        initialPaymentDate = paymentRow.created_at;
        try {
          const { data: gymDetails } = await admin
            .from("gyms")
            .select("name, address, city, phone, email")
            .eq("id", actor.gym_id)
            .single();

          const pdfBuffer = generateInvoicePdfBuffer({
            gym: gymDetails ?? { name: gym?.name ?? "ATP Fitness" },
            invoiceNumber,
            receiptNumber,
            issuedAt: paymentRow.created_at,
            billedToName: data.fullName,
            lineItems: [{ description: plan.name ?? "Membership payment", amount: data.amountPaid }],
            totalAmount: data.amountPaid,
            method: paymentMethod,
          });

          await uploadBufferToCloudinary(pdfBuffer, "invoices", `invoice-${invoiceNumber}`);
          initialInvoiceUrl = buildInvoiceDownloadUrl(invoiceNumber);
        } catch (pdfErr) {
          console.error("createMember: invoice PDF generation/upload failed:", pdfErr);
        }
      }
    }
  }

  // 5. Photo as a member document too, for the gallery/history view.
  if (data.photoUrl) {
    await admin.from("member_documents").insert({
      member_id: memberId,
      gym_id: actor.gym_id,
      doc_type: "photo",
      cloudinary_public_id: "",
      url: data.photoUrl,
      uploaded_by: actor.id,
    });
  }

  // 6. Notifications — best-effort, never block member creation on delivery.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const gymName = gym?.name ?? "your gym";
  await Promise.allSettled([
    sendEmail({
      to: data.email,
      subject: `Welcome to ${gymName} — your account is ready`,
      html: memberWelcomeEmailHtml({
        memberName: data.fullName,
        gymName,
        email: data.email,
        temporaryPassword,
        loginUrl: `${appUrl}/login`,
      }),
      text: memberWelcomeEmailText({
        memberName: data.fullName,
        gymName,
        email: data.email,
        temporaryPassword,
        loginUrl: `${appUrl}/login`,
      }),
    }),
    // Direct to Meta's Cloud API — no Twilio relay. Uses an approved template
    // when WHATSAPP_MEMBER_WELCOME_TEMPLATE is set, since a welcome message is
    // business-initiated and plain text is rejected outside the 24h window.
    sendMemberWelcomeWhatsApp({
      phone: data.phone,
      memberName: data.fullName,
      gymName,
      email: data.email,
      temporaryPassword,
      loginUrl: `${appUrl}/login`,
    }),
    sendEmail({
      to: data.email,
      subject: `Your membership at ${gymName} is confirmed`,
      html: subscriptionConfirmationEmailHtml({
        memberName: data.fullName,
        gymName,
        planName: plan.name ?? "Membership",
        startDate: data.startDate,
        endDate,
        durationDays: plan.duration_days,
        amountPaid: data.amountPaid,
        paymentDate: initialPaymentDate,
        paymentMethod: data.amountPaid > 0 ? paymentMethod : null,
        invoiceUrl: initialInvoiceUrl,
      }),
      text: subscriptionConfirmationEmailText({
        memberName: data.fullName,
        gymName,
        planName: plan.name ?? "Membership",
        startDate: data.startDate,
        endDate,
        durationDays: plan.duration_days,
        amountPaid: data.amountPaid,
        paymentDate: initialPaymentDate,
        paymentMethod: data.amountPaid > 0 ? paymentMethod : null,
        invoiceUrl: initialInvoiceUrl,
      }),
    }),
  ]);

  // ------------------------------------------------------------------------
  // WhatsApp "subscription activated" notification.
  //
  // THIS PATH PREVIOUSLY SENT NOTHING. createMember() writes the membership and
  // the first payment row directly instead of going through recordPayment(),
  // which was the only place the WhatsApp confirmation lived — so brand-new
  // subscribers, the main "user subscribes" flow, never received it. Only
  // renewals did.
  //
  // notifyActivationIfPaid() re-checks the subscription in the database and
  // only sends when the period is active AND money has actually been recorded
  // against it, so a "pay later" signup correctly waits until the first real
  // payment. Idempotent and non-throwing: a delivery failure here can never
  // undo the member that was just created.
  // ------------------------------------------------------------------------
  await notifyActivationIfPaid(admin, membership.id);

  revalidatePath("/dashboard/owner/members");
  revalidatePath("/dashboard/reception/members");
  revalidatePath("/dashboard/trainer/clients");
  return { success: true, data: { memberId } };
}

// ============================================================================
// UPDATE MEMBER
// ============================================================================
export async function updateMember(memberId: string, input: Partial<MemberFormInput>): Promise<ActionResult> {
  try {
    await requirePermission("members", "update");
  } catch {
    return { success: false, error: "You do not have permission to edit members." };
  }

  const supabase = await createClient();

  if (input.fullName || input.phone || input.photoUrl !== undefined) {
    const { error } = await supabase
      .from("profiles")
      .update({
        ...(input.fullName && { full_name: input.fullName }),
        ...(input.phone && { phone: input.phone }),
        ...(input.photoUrl !== undefined && { avatar_url: input.photoUrl }),
      })
      .eq("id", memberId);
    if (error) return { success: false, error: "Could not update the member's profile." };
  }

  const detailsUpdate: Record<string, unknown> = {};
  if (input.dateOfBirth !== undefined) detailsUpdate.date_of_birth = input.dateOfBirth || null;
  if (input.gender !== undefined) detailsUpdate.gender = input.gender;
  if (input.address !== undefined) detailsUpdate.address = input.address;
  if (input.emergencyContactName !== undefined) detailsUpdate.emergency_contact_name = input.emergencyContactName;
  if (input.emergencyContactPhone !== undefined) detailsUpdate.emergency_contact_phone = input.emergencyContactPhone;
  if (input.bloodGroup !== undefined) detailsUpdate.blood_group = input.bloodGroup;
  if (input.medicalConditions !== undefined) detailsUpdate.medical_conditions = input.medicalConditions;
  if (input.heightCm !== undefined) detailsUpdate.height_cm = input.heightCm;
  if (input.weightKg !== undefined) detailsUpdate.weight_kg = input.weightKg;
  if (input.trainerId !== undefined) detailsUpdate.assigned_trainer_id = input.trainerId;

  if (Object.keys(detailsUpdate).length > 0) {
    const { error } = await supabase.from("member_details").update(detailsUpdate).eq("profile_id", memberId);
    if (error) return { success: false, error: "Could not update the member's details." };
  }

  revalidatePath("/dashboard/owner/members");
  revalidatePath("/dashboard/reception/members");
  revalidatePath(`/dashboard/owner/members/${memberId}`);
  return { success: true };
}

// ============================================================================
// DEACTIVATE / DELETE MEMBER (soft delete — deactivate; hard delete gym-owner only)
// ============================================================================
export async function deactivateMember(memberId: string): Promise<ActionResult> {
  try {
    await requirePermission("members", "update");
  } catch {
    return { success: false, error: "You do not have permission to change member status." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("member_details").update({ status: "cancelled" }).eq("profile_id", memberId);
  if (error) return { success: false, error: "Could not deactivate the member." };
  revalidatePath("/dashboard/owner/members");
  revalidatePath("/dashboard/reception/members");
  return { success: true };
}

export async function deleteMember(memberId: string): Promise<ActionResult> {
  try {
    await requireRole("gym_owner", "super_admin");
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : "Not permitted." };
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(memberId); // cascades via FK on profiles
  if (error) return { success: false, error: "Could not delete the member." };
  revalidatePath("/dashboard/owner/members");
  return { success: true };
}

// ============================================================================
// FORM OPTIONS — plans + trainers for the add/edit member form selects
// ============================================================================
// ============================================================================
// RENEWALS — members expiring within the next N days, and already-expired
// members. Owner and Trainer dashboards both use this (RLS already scopes
// trainers and owners to their own gym via is_staff() + gym_id checks on the
// underlying tables, so no extra role branching is needed here).
// ============================================================================
export interface ListExpiringMembersParams {
  window: "expiring_soon" | "expired";
  page: number;
  pageSize: number;
  search?: string;
  /** Only used for "expiring_soon" — how many days out counts as "soon". Defaults to 10. */
  withinDays?: number;
}

export async function listExpiringMembers(params: ListExpiringMembersParams) {
  const supabase = await createClient();
  const { window, page, pageSize, search, withinDays = 10 } = params;

  let query = supabase
    .from("members_overview")
    .select("*", { count: "exact" })
    .not("membership_id", "is", null);

  query =
    window === "expiring_soon"
      ? query.gte("days_until_expiry", 0).lte("days_until_expiry", withinDays)
      : query.lt("days_until_expiry", 0);

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  query = query
    // Soonest-to-expire first when upcoming; most-recently-expired first when overdue.
    .order("days_until_expiry", { ascending: window === "expiring_soon" })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return { rows: data ?? [], total: count ?? 0 };
}

export async function getMemberFormOptions() {
  const supabase = await createClient();
  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { plans: [], trainers: [] };

  const [{ data: plans }, { data: trainers }] = await Promise.all([
    supabase
      .from("membership_plans")
      .select("id, name, duration_days, price")
      .eq("gym_id", actor.gym_id)
      .eq("is_active", true)
      .order("duration_days"),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("gym_id", actor.gym_id)
      .eq("role", "trainer")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  return { plans: plans ?? [], trainers: trainers ?? [] };
}

export async function getMember(memberId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("members_overview").select("*").eq("profile_id", memberId).single();
  if (error) return null;
  return data;
}

export interface ListMembersParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export async function listMembers(params: ListMembersParams) {
  const supabase = await createClient();
  const { page, pageSize, search, status, sortBy = "full_name", sortDir = "asc" } = params;

  let query = supabase.from("members_overview").select("*", { count: "exact" });

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  query = query
    .order(sortBy, { ascending: sortDir === "asc" })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return { rows: data ?? [], total: count ?? 0 };
}

// ============================================================================
// DASHBOARD SUMMARY — real aggregate counts for the Owner/Reception overview
// ============================================================================
export async function getMemberDashboardStats() {
  const supabase = await createClient();
  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { totalMembers: 0, activeMembers: 0, expiringSoon: 0, expired: 0 };

  const { count: totalMembers } = await supabase
    .from("member_details")
    .select("*", { count: "exact", head: true })
    .eq("gym_id", actor.gym_id);

  const { count: activeMembers } = await supabase
    .from("member_details")
    .select("*", { count: "exact", head: true })
    .eq("gym_id", actor.gym_id)
    .eq("status", "active");

  const today = new Date().toISOString().slice(0, 10);
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const { count: expiringSoon } = await supabase
    .from("member_memberships")
    .select("*", { count: "exact", head: true })
    .eq("gym_id", actor.gym_id)
    .eq("is_current", true)
    .gte("end_date", today)
    .lte("end_date", in7Days);

  const { count: expired } = await supabase
    .from("member_memberships")
    .select("*", { count: "exact", head: true })
    .eq("gym_id", actor.gym_id)
    .eq("is_current", true)
    .lt("end_date", today);

  return {
    totalMembers: totalMembers ?? 0,
    activeMembers: activeMembers ?? 0,
    expiringSoon: expiringSoon ?? 0,
    expired: expired ?? 0,
  };
}