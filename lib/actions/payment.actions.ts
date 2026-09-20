"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requirePermission, requireRole, getCurrentProfile, PermissionError } from "@/lib/utils/permissions";
import { sendEmail, subscriptionConfirmationEmailHtml, subscriptionConfirmationEmailText } from "@/lib/services/email";
import { notifyActivationIfPaid } from "@/lib/services/subscription-lifecycle";
import { lifecycleLog } from "@/lib/services/logger";
import { addDaysToDateString } from "@/lib/utils/datetime";
import { generateInvoicePdfBuffer } from "@/lib/services/invoice-pdf";
import { uploadBufferToCloudinary } from "@/lib/services/cloudinary";
import { buildInvoiceDownloadUrl } from "@/lib/services/invoice-links";
import type { ActionResult } from "./auth.actions";
import type { PaymentMethod } from "@/types/database";

// Calendar arithmetic is delegated to lib/utils/datetime so it can't drift:
// the previous local implementation parsed the date as UTC midnight, applied
// the *local* setDate(), then reformatted via toISOString(), which shifts the
// result by a day on any host running west of UTC.
const addDays = addDaysToDateString;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// RECORD PAYMENT (handles cash/UPI/card/bank and split payments + GST)
// ============================================================================
export interface RecordPaymentInput {
  memberId: string;
  membershipId?: string | null;
  amount: number;
  gstRate?: number;
  method: PaymentMethod;
  transactionReference?: string;
  splits?: { method: Exclude<PaymentMethod, "split">; amount: number; transactionReference?: string }[];
  notes?: string;
}

export async function recordPayment(input: RecordPaymentInput): Promise<ActionResult<{ paymentId: string; invoiceNumber: string; receiptNumber: string }>> {
  try {
    await requirePermission("payments", "create");
  } catch {
    return { success: false, error: "You do not have permission to record payments." };
  }

  if (input.method === "split") {
    const splitTotal = round2((input.splits ?? []).reduce((sum, s) => sum + s.amount, 0));
    if (!input.splits?.length) return { success: false, error: "Add at least one split payment method." };
    if (splitTotal !== round2(input.amount)) {
      return { success: false, error: `Split amounts (₹${splitTotal}) must add up to the total (₹${input.amount}).` };
    }
  }

  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { success: false, error: "Your account isn't linked to a gym." };

  const supabase = await createClient();
  const gstRate = input.gstRate ?? 0;
  const gstAmount = round2(input.amount * (gstRate / 100));
  const totalAmount = round2(input.amount + gstAmount);

  const [{ data: invoiceNumber }, { data: receiptNumber }] = await Promise.all([
    supabase.rpc("next_invoice_number", { p_gym_id: actor.gym_id }),
    supabase.rpc("next_receipt_number", { p_gym_id: actor.gym_id }),
  ]);

  if (!invoiceNumber || !receiptNumber) {
    return { success: false, error: "Could not generate an invoice/receipt number." };
  }

  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      gym_id: actor.gym_id,
      member_id: input.memberId,
      membership_id: input.membershipId ?? null,
      amount: input.amount,
      gst_rate: gstRate,
      gst_amount: gstAmount,
      total_amount: totalAmount,
      method: input.method,
      transaction_reference: input.transactionReference || null,
      invoice_number: invoiceNumber,
      receipt_number: receiptNumber,
      notes: input.notes || null,
      created_by: actor.id,
    })
    .select()
    .single();

  if (error || !payment) return { success: false, error: "Could not record the payment." };

  if (input.method === "split" && input.splits?.length) {
    const { error: splitError } = await supabase.from("payment_splits").insert(
      input.splits.map((s) => ({
        payment_id: payment.id,
        method: s.method,
        amount: s.amount,
        transaction_reference: s.transactionReference || null,
      }))
    );
    if (splitError) return { success: false, error: "Payment saved, but split details failed to save." };
  }

  // Keep the membership's paid-so-far figure in sync.
  if (input.membershipId) {
    const { data: membership } = await supabase
      .from("member_memberships")
      .select("amount_paid, amount")
      .eq("id", input.membershipId)
      .single();
    if (membership) {
      const newPaid = round2((membership.amount_paid ?? 0) + input.amount);
      await supabase
        .from("member_memberships")
        .update({
          amount_paid: newPaid,
          payment_status: newPaid >= membership.amount ? "paid" : newPaid > 0 ? "partial" : "pending",
        })
        .eq("id", input.membershipId);
    }
  }

  // Generate the PDF invoice for this payment and email it to the member as a
  // "payment confirmed" receipt with a Download Invoice link — mirrors the
  // confirmation email sent on member creation (see member.actions.ts),
  // but was previously missing here, so renewals/top-up payments never got
  // an invoice link at all. Best-effort: never fails the payment itself.
  try {
    const admin = createAdminClient();

    const [{ data: member }, { data: gymDetails }] = await Promise.all([
      admin.from("profiles").select("full_name, email, phone").eq("id", input.memberId).single(),
      admin.from("gyms").select("name, address, city, phone, email").eq("id", actor.gym_id).single(),
    ]);

    let planName: string | null = null;
    let membershipStartDate: string | null = null;
    let membershipEndDate: string | null = null;
    let membershipDurationDays = 0;

    if (input.membershipId) {
      const { data: membershipDetails } = await admin
        .from("member_memberships")
        .select("start_date, end_date, membership_plans:plan_id(name, duration_days)")
        .eq("id", input.membershipId)
        .single();
      if (membershipDetails) {
        membershipStartDate = membershipDetails.start_date;
        membershipEndDate = membershipDetails.end_date;
        const plan = membershipDetails.membership_plans as unknown as { name: string; duration_days: number } | null;
        planName = plan?.name ?? null;
        membershipDurationDays = plan?.duration_days ?? 0;
      }
    }

    const pdfBuffer = generateInvoicePdfBuffer({
      gym: gymDetails ?? { name: "ATP Fitness" },
      invoiceNumber,
      receiptNumber,
      issuedAt: payment.created_at,
      billedToName: member?.full_name ?? "Member",
      lineItems: [{ description: planName ? `${planName} membership payment` : "Membership payment", amount: input.amount }],
      gstRate,
      gstAmount,
      totalAmount,
      method: input.method,
      splits: input.method === "split" ? input.splits?.map((s) => ({ method: s.method, amount: s.amount, transactionReference: s.transactionReference })) : undefined,
    });

    await uploadBufferToCloudinary(pdfBuffer, "invoices", `invoice-${invoiceNumber}`);
    const invoiceUrl = buildInvoiceDownloadUrl(invoiceNumber);

    if (member?.email) {
      const gymName = gymDetails?.name ?? "your gym";
      await sendEmail({
        to: member.email,
        subject: `Payment confirmed — ${gymName}`,
        html: subscriptionConfirmationEmailHtml({
          memberName: member.full_name ?? "there",
          gymName,
          planName: planName ?? "Membership",
          startDate: membershipStartDate ?? payment.created_at,
          endDate: membershipEndDate ?? payment.created_at,
          durationDays: membershipDurationDays,
          amountPaid: input.amount,
          paymentDate: payment.created_at,
          paymentMethod: input.method,
          invoiceUrl,
        }),
        text: subscriptionConfirmationEmailText({
          memberName: member.full_name ?? "there",
          gymName,
          planName: planName ?? "Membership",
          startDate: membershipStartDate ?? payment.created_at,
          endDate: membershipEndDate ?? payment.created_at,
          durationDays: membershipDurationDays,
          amountPaid: input.amount,
          paymentDate: payment.created_at,
          paymentMethod: input.method,
          invoiceUrl,
        }),
      });
    }


  } catch (invoiceErr) {
    console.error("recordPayment: invoice PDF generation/email failed:", invoiceErr);
  }

  // ------------------------------------------------------------------------
  // WhatsApp "subscription activated" notification.
  //
  // Keyed on the MEMBERSHIP PERIOD, not on this payment row. That matters:
  // this function also runs for each EMI installment, for partial payments and
  // for top-ups, and the previous inline send fired on every one of them — a
  // 6-installment plan sent six "subscription confirmed" messages.
  //
  // notifyActivationIfPaid() re-reads the subscription from the database and
  // claims a row in subscription_notifications, so no matter how many times
  // this is reached (double submit, retried request, refreshed page) exactly
  // one message is ever sent per membership period.
  //
  // Deliberately outside the try/catch above and awaited without its result
  // gating anything: a WhatsApp outage must never fail a payment that has
  // already been recorded.
  // ------------------------------------------------------------------------
  if (input.membershipId) {
    const admin = createAdminClient();
    await notifyActivationIfPaid(admin, input.membershipId);
  }

  revalidatePath("/dashboard/owner/payments");
  revalidatePath("/dashboard/reception/payments");
  return { success: true, data: { paymentId: payment.id, invoiceNumber, receiptNumber } };
}

// ============================================================================
// RENEW MEMBERSHIP — closes the current period, opens a new one, and
// optionally records the renewal payment in the same step.
// ============================================================================
export interface RenewMembershipInput {
  memberId: string;
  planId: string;
  startDate?: string; // defaults to day after current end_date, or today if expired
  amount: number;
  discountAmount?: number;
  trainerId?: string | null;
  payment?: Omit<RecordPaymentInput, "memberId" | "membershipId">;
}

export async function renewMembership(input: RenewMembershipInput): Promise<ActionResult<{ membershipId: string }>> {
  try {
    await requirePermission("members", "update");
  } catch {
    return { success: false, error: "You do not have permission to renew memberships." };
  }

  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { success: false, error: "Your account isn't linked to a gym." };

  const supabase = await createClient();

  const { data: plan } = await supabase.from("membership_plans").select("duration_days").eq("id", input.planId).single();
  if (!plan) return { success: false, error: "Selected plan was not found." };

  const { data: currentMembership } = await supabase
    .from("member_memberships")
    .select("end_date")
    .eq("member_id", input.memberId)
    .eq("is_current", true)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const startDate =
    input.startDate ??
    (currentMembership && currentMembership.end_date >= today ? addDays(currentMembership.end_date, 1) : today);
  const endDate = addDays(startDate, plan.duration_days);

  const { data: newMembership, error } = await supabase
    .from("member_memberships")
    .insert({
      member_id: input.memberId,
      gym_id: actor.gym_id,
      plan_id: input.planId,
      start_date: startDate,
      end_date: endDate,
      amount: input.amount,
      discount_amount: input.discountAmount ?? 0,
      amount_paid: 0,
      payment_status: "pending",
      trainer_id: input.trainerId ?? null,
      is_current: true,
      created_by: actor.id,
    })
    .select()
    .single();

  if (error || !newMembership) return { success: false, error: "Could not create the renewed membership." };

  lifecycleLog.info("SUBSCRIPTION_CREATED", {
    membershipId: newMembership.id,
    memberId: input.memberId,
    gymId: actor.gym_id,
    source: "renewal",
  });

  if (input.payment) {
    const paymentResult = await recordPayment({
      ...input.payment,
      memberId: input.memberId,
      membershipId: newMembership.id,
    });
    if (!paymentResult.success) {
      return { success: true, data: { membershipId: newMembership.id } }; // membership renewed even if payment recording had an issue
    }
  }

  revalidatePath(`/dashboard/owner/members/${input.memberId}`);
  revalidatePath(`/dashboard/reception/members/${input.memberId}`);
  return { success: true, data: { membershipId: newMembership.id } };
}

// ============================================================================
// REFUNDS
// ============================================================================
export async function issueRefund(paymentId: string, amount: number, reason: string): Promise<ActionResult> {
  try {
    await requireRole("gym_owner", "super_admin");
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : "Not permitted." };
  }

  const actor = await getCurrentProfile();
  const supabase = await createClient();

  const { data: payment } = await supabase.from("payments").select("total_amount, gym_id").eq("id", paymentId).single();
  if (!payment) return { success: false, error: "Payment not found." };
  if (amount > payment.total_amount) return { success: false, error: "Refund cannot exceed the original payment." };

  const { error } = await supabase.from("refunds").insert({
    payment_id: paymentId,
    gym_id: payment.gym_id,
    amount,
    reason,
    refunded_by: actor?.id,
  });
  if (error) return { success: false, error: "Could not record the refund." };

  if (round2(amount) === round2(payment.total_amount)) {
    await supabase.from("payments").update({ is_refunded: true }).eq("id", paymentId);
  }

  revalidatePath("/dashboard/owner/payments");
  return { success: true };
}

// ============================================================================
// EMI INSTALLMENTS
// ============================================================================
export interface CreateEmiPlanInput {
  membershipId: string;
  totalAmount: number;
  numberOfInstallments: number;
  firstDueDate: string;
  intervalDays: number; // e.g. 30 for monthly
}

export async function createEmiPlan(input: CreateEmiPlanInput): Promise<ActionResult> {
  try {
    await requirePermission("payments", "create");
  } catch {
    return { success: false, error: "You do not have permission to set up EMI plans." };
  }

  const actor = await getCurrentProfile();
  if (!actor?.gym_id) return { success: false, error: "Your account isn't linked to a gym." };

  const supabase = await createClient();
  const perInstallment = round2(input.totalAmount / input.numberOfInstallments);

  const rows = Array.from({ length: input.numberOfInstallments }, (_, i) => ({
    membership_id: input.membershipId,
    gym_id: actor.gym_id!,
    installment_number: i + 1,
    due_date: addDays(input.firstDueDate, i * input.intervalDays),
    amount: i === input.numberOfInstallments - 1
      ? round2(input.totalAmount - perInstallment * (input.numberOfInstallments - 1)) // absorb rounding on the last installment
      : perInstallment,
  }));

  const { error } = await supabase.from("emi_installments").insert(rows);
  if (error) return { success: false, error: "Could not create the EMI schedule." };

  return { success: true };
}

export async function recordEmiInstallmentPayment(
  installmentId: string,
  payment: Omit<RecordPaymentInput, "memberId" | "membershipId">
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: installment } = await supabase
    .from("emi_installments")
    .select("membership_id, amount")
    .eq("id", installmentId)
    .single();
  if (!installment) return { success: false, error: "Installment not found." };

  const { data: membership } = await supabase
    .from("member_memberships")
    .select("member_id")
    .eq("id", installment.membership_id)
    .single();
  if (!membership) return { success: false, error: "Membership not found." };

  const result = await recordPayment({
    ...payment,
    memberId: membership.member_id,
    membershipId: installment.membership_id,
    amount: installment.amount,
  });
  if (!result.success) return result;

  await supabase
    .from("emi_installments")
    .update({ status: "paid", paid_payment_id: result.data?.paymentId, paid_at: new Date().toISOString() })
    .eq("id", installmentId);

  return { success: true };
}

export async function getEmiSchedule(membershipId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("emi_installments")
    .select("*")
    .eq("membership_id", membershipId)
    .order("installment_number");
  return data ?? [];
}

// ============================================================================
// LIST / FETCH PAYMENTS
// ============================================================================
export interface ListPaymentsParams {
  page: number;
  pageSize: number;
  search?: string;
  method?: string;
}

export async function listPayments(params: ListPaymentsParams) {
  const supabase = await createClient();
  const { page, pageSize, search, method } = params;

  let query = supabase.from("payments_overview").select("*", { count: "exact" });
  if (search) {
    query = query.or(`member_name.ilike.%${search}%,invoice_number.ilike.%${search}%,receipt_number.ilike.%${search}%`);
  }
  if (method && method !== "all") query = query.eq("method", method);

  query = query.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getPaymentForInvoice(paymentId: string) {
  const supabase = await createClient();
  const { data: payment } = await supabase.from("payments_overview").select("*").eq("id", paymentId).single();
  if (!payment) return null;

  const { data: splits } = await supabase.from("payment_splits").select("*").eq("payment_id", paymentId);
  const { data: gym } = await supabase.from("gyms").select("name, address, city, phone, email").eq("id", payment.gym_id).single();

  return { payment, splits: splits ?? [], gym };
}

export async function getMemberPaymentHistory(memberId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments_overview")
    .select("*")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  return data ?? [];
}