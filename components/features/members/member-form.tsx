"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  CreditCard, 
  ShieldPlus, 
  CheckCircle2, 
  AlertTriangle, 
  User, 
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { PhotoUpload } from "./photo-upload";
import { createMember } from "@/lib/actions/member.actions";
import { convertLeadToMember } from "@/lib/actions/crm.actions";
import { memberFormSchema, type MemberFormInput } from "@/lib/validations/member";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";

interface PlanOption { id: string; name: string; duration_days: number; price: number }
interface TrainerOption { id: string; full_name: string }

export function MemberForm({
  basePath,
  plans,
  trainers,
  leadId,
  defaultValues,
}: {
  basePath: string;
  plans: PlanOption[];
  trainers: TrainerOption[];
  leadId?: string;
  defaultValues?: Partial<Pick<MemberFormInput, "fullName" | "email" | "phone">>;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<MemberFormInput>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      joiningDate: format(new Date(), "yyyy-MM-dd"),
      startDate: format(new Date(), "yyyy-MM-dd"),
      bloodGroup: "unknown",
      paymentStatus: "pending",
      discountAmount: 0,
      amountPaid: 0,
      photoUrl: null,
      ...defaultValues,
    },
  });

  const selectedPlanId = form.watch("planId");
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const enteredAmount = form.watch("amount");
  const enteredAmountPaid = form.watch("amountPaid");
  const discountAmount = form.watch("discountAmount");

  // Default the charged Amount to the selected plan's price. Only overwrites
  // when the field is still empty/untouched so an owner can freely discount
  // by editing Amount afterwards without this effect stomping their edit
  // every time they touch something else on the form.
  useEffect(() => {
    if (selectedPlan && !form.formState.dirtyFields.amount) {
      form.setValue("amount", selectedPlan.price);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan?.id]);

  // Discount is derived, not manually entered: it's simply what's being
  // waived off the plan's list price by charging less than sticker price.
  useEffect(() => {
    if (!selectedPlan) return;
    const amountNum = Number(enteredAmount ?? 0);
    const computedDiscount = Math.max(selectedPlan.price - amountNum, 0);
    form.setValue("discountAmount", computedDiscount);
  }, [selectedPlan, enteredAmount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Payment status is a genuinely editable field (a receptionist may know a
  // payment is "pending" even with ₹0 recorded yet), so this only nudges the
  // value when the balance math makes the current selection stale -- it never
  // fights a status the user just picked by hand for the same balance.
  const balanceDue = Math.max(Number(enteredAmount ?? 0) - Number(enteredAmountPaid ?? 0), 0);
  useEffect(() => {
    const amountNum = Number(enteredAmount ?? 0);
    const paidNum = Number(enteredAmountPaid ?? 0);
    if (amountNum <= 0) return;
    const suggested = paidNum <= 0 ? "pending" : paidNum >= amountNum ? "paid" : "partial";
    if (!form.formState.dirtyFields.paymentStatus && form.getValues("paymentStatus") !== suggested) {
      form.setValue("paymentStatus", suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enteredAmount, enteredAmountPaid]);

  function onSubmit(values: MemberFormInput) {
    setServerError(null);
    startTransition(async () => {
      const result = leadId ? await convertLeadToMember(leadId, values) : await createMember(values);
      if (!result.success) {
        setServerError(result.error);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof MemberFormInput, { message });
          }
        }
        return;
      }
      router.push(basePath);
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="relative flex flex-col gap-6 pb-28 sm:pb-24 w-full">
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <User className="h-5 w-5 text-primary shrink-0" /> 
            Photo & basic details
          </CardTitle>
          <CardDescription>Personal information and contact details of the member.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Controller
            control={form.control}
            name="photoUrl"
            render={({ field }) => (
              <div className="flex justify-center sm:justify-start">
                <PhotoUpload
                  folder="members/photos"
                  publicIdPrefix={form.watch("fullName") || "member"}
                  value={field.value}
                  onChange={field.onChange}
                />
              </div>
            )}
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
            <Field label="Full name" error={form.formState.errors.fullName?.message}>
              <Input {...form.register("fullName")} placeholder="Priya Sharma" className="w-full" />
            </Field>
            <Field label="Phone" error={form.formState.errors.phone?.message}>
              <Input {...form.register("phone")} placeholder="+919876543210" className="w-full" />
            </Field>
            <Field label="Email" error={form.formState.errors.email?.message}>
              <Input type="email" {...form.register("email")} placeholder="priya@example.com" className="w-full" />
            </Field>
            <Field label="Date of birth">
              <Input type="date" {...form.register("dateOfBirth")} className="w-full" />
            </Field>
            <Field label="Gender">
              <Select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" {...form.register("gender")}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </Select>
            </Field>
            <Field label="Joining date" error={form.formState.errors.joiningDate?.message}>
              <Input type="date" {...form.register("joiningDate")} className="w-full" />
            </Field>
          </div>
          <div className="w-full md:w-2/3 lg:w-1/2">
            <Field label="Address">
              <Input {...form.register("address")} placeholder="Street, City, State, Zip" className="w-full" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <CreditCard className="h-5 w-5 text-primary shrink-0" /> 
            Membership & payment
          </CardTitle>
          <CardDescription>Pick a plan, assign a trainer, and record what's been paid so far.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-4">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Plan Details
            </h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
              <Field label="Plan" error={form.formState.errors.planId?.message}>
                <Select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" {...form.register("planId")}>
                  <option value="">Select a plan</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.duration_days} days — ₹{p.price}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Assign trainer">
                <Select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" {...form.register("trainerId")}>
                  <option value="">Unassigned</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Start date" error={form.formState.errors.startDate?.message}>
                <Input type="date" {...form.register("startDate")} className="w-full" />
              </Field>
            </div>
          </div>

          <div className="space-y-4 border-t pt-6">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              Payment Processing
            </h3>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Amount charged (₹)" hint={selectedPlan ? `Plan price: ₹${selectedPlan.price}` : undefined}>
                <Input type="number" step="0.01" {...form.register("amount")} className="w-full" />
              </Field>
              <Field label="Discount (₹)" hint="Auto-calculated from plan price.">
                <Input
                  type="number"
                  step="0.01"
                  readOnly
                  tabIndex={-1}
                  {...form.register("discountAmount")}
                  className="w-full cursor-not-allowed bg-muted/50 text-muted-foreground shadow-none border-dashed focus-visible:ring-0"
                />
              </Field>
              <Field label="Amount paid (₹)">
                <Input type="number" step="0.01" {...form.register("amountPaid")} className="w-full" />
              </Field>
              <Field label="Payment status" hint="Auto-suggested based on balance.">
                <Select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" {...form.register("paymentStatus")}>
                  <option value="pending">Pending</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                </Select>
              </Field>
            </div>
          </div>

          {Number(enteredAmount ?? 0) > 0 && (
            <div className="grid grid-cols-1 gap-4 rounded-xl border bg-slate-50/50 p-4 dark:bg-slate-900/20 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
              <SummaryStat label="Plan price" value={selectedPlan ? `₹${selectedPlan.price}` : "—"} />
              <SummaryStat label="Discount" value={`₹${Number(discountAmount ?? 0)}`} />
              <SummaryStat label="Amount paid" value={`₹${Number(enteredAmountPaid ?? 0)}`} />
              <SummaryStat
                label="Balance due"
                value={`₹${balanceDue}`}
                icon={balanceDue > 0 ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                tone={balanceDue > 0 ? "warning" : "success"}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <ShieldPlus className="h-5 w-5 text-primary shrink-0" /> 
            Emergency contact & medical
          </CardTitle>
          <CardDescription>Optional — add whatever you have on hand; nothing here blocks creating the member.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
            <Field label="Emergency contact name">
              <Input {...form.register("emergencyContactName")} placeholder="Contact name" className="w-full" />
            </Field>
            <Field label="Emergency contact phone">
              <Input {...form.register("emergencyContactPhone")} placeholder="+919876543210" className="w-full" />
            </Field>
            <Field label="Blood group">
              <Select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" {...form.register("bloodGroup")}>
                {["unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                  <option key={bg} value={bg}>{bg === "unknown" ? "Unknown" : bg}</option>
                ))}
              </Select>
            </Field>
            <Field label="Height (cm)">
              <Input type="number" step="0.1" {...form.register("heightCm")} placeholder="175" className="w-full" />
            </Field>
            <Field label="Weight (kg)">
              <Input type="number" step="0.1" {...form.register("weightKg")} placeholder="70" className="w-full" />
            </Field>
          </div>
          <div className="w-full md:w-2/3 lg:w-1/2">
            <Field label="Medical conditions">
              <Input {...form.register("medicalConditions")} placeholder="E.g., Asthma, prior back injury (any conditions the trainer should know about)" className="w-full" />
            </Field>
          </div>
        </CardContent>
      </Card>

      {serverError && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/15 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{serverError}</p>
        </div>
      )}

      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background/80 p-4 backdrop-blur-md shadow-[0_-4px_12px_rgba(0,0,0,0.03)] dark:shadow-none">
        <div className="container max-w-5xl mx-auto flex flex-row items-center justify-end gap-3 px-2 sm:px-4">
          <Button 
            type="button" 
            variant="outline" 
            className="flex-1 sm:flex-none w-full sm:w-24" 
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            className="flex-[2] sm:flex-none w-full sm:w-40" 
            disabled={isPending}
          >
            {isPending ? "Saving..." : leadId ? "Convert to member" : "Create member"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "warning" | "success";
}) {
  return (
    <div className="flex flex-col space-y-1.5 rounded-lg bg-background p-3.5 shadow-sm border overflow-hidden">
      <p className="text-xs sm:text-[13px] font-medium text-muted-foreground truncate">{label}</p>
      <p
        className={cn(
          "flex items-center gap-1.5 text-base sm:text-lg font-bold tracking-tight truncate",
          tone === "warning" && "text-amber-600 dark:text-amber-500",
          tone === "success" && "text-emerald-600 dark:text-emerald-500"
        )}
      >
        {icon}
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col space-y-1.5 w-full">
      <Label className={cn("text-sm font-medium", error && "text-destructive")}>
        {label}
      </Label>
      {children}
      {hint && !error && (
        <p className="flex items-center gap-1.5 text-[12px] sm:text-[13px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p className="text-[12px] sm:text-[13px] font-medium text-destructive">{error}</p>
      )}
    </div>
  );
}