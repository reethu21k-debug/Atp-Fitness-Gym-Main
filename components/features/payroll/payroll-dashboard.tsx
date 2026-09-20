"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { 
  Settings, 
  FileText, 
  Receipt, 
  Users, 
  History, 
  UserCheck, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  IndianRupee,
  Percent,
  ChevronRight,
  FileX
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalaryConfigDialog } from "./salary-config-dialog";
import { GeneratePayslipDialog } from "./generate-payslip-dialog";

interface StaffRow {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  salaryConfig: { base_salary: number; commission_rate: number } | null;
}

interface PayslipRow {
  id: string;
  month: string;
  net_pay: number;
  status: string;
  profiles: { full_name: string; role: string } | null;
}

const getStatusBadge = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "paid" || normalized === "processed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 backdrop-blur-md dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> {status}
      </span>
    );
  }
  if (normalized === "pending" || normalized === "draft") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 backdrop-blur-md dark:text-amber-400">
        <Clock className="h-3 w-3" /> {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive backdrop-blur-md">
      <AlertCircle className="h-3 w-3" /> {status}
    </span>
  );
};

export function PayrollDashboard({
  staff,
  payslips,
}: {
  staff: StaffRow[];
  payslips: PayslipRow[];
}) {
  const [salaryDialogFor, setSalaryDialogFor] = useState<StaffRow | null>(null);
  const [payslipDialogFor, setPayslipDialogFor] = useState<StaffRow | null>(null);

  return (
    <div className="space-y-10">
      
      {/* Section 1: Staff Directory & Configurations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Staff Overview</h2>
            <span className="ml-1 rounded-full border border-border/40 bg-secondary/30 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {staff.length}
            </span>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((s) => (
            <div
              key={s.id}
              className="group relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-6 shadow-xl backdrop-blur-2xl transition-all hover:bg-card/60 hover:shadow-2xl"
            >
              {/* Subtle ambient card glow */}
              <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-[50px] transition-all group-hover:bg-primary/20" />

              {/* Staff Header */}
              <div className="flex items-start gap-4">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary/20 bg-primary/10 text-base font-bold text-primary shadow-inner">
                  {s.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.avatar_url}
                      alt={s.full_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    s.full_name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="truncate font-semibold text-foreground">{s.full_name}</h3>
                  <span className="inline-block rounded-full border border-border/40 bg-secondary/40 px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                    {s.role.replace("_", " ")}
                  </span>
                </div>
              </div>

              {/* Salary Configuration Mini Card */}
              <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-border/30 bg-secondary/20 p-3.5 backdrop-blur-sm">
                <div>
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <IndianRupee className="h-3 w-3" /> Base Salary
                  </span>
                  <p className="mt-1 font-mono text-sm font-bold text-foreground">
                    ₹{(s.salaryConfig?.base_salary ?? 0).toLocaleString("en-IN")}
                    <span className="text-[10px] font-normal text-muted-foreground">/mo</span>
                  </p>
                </div>
                <div>
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Percent className="h-3 w-3" /> Commission
                  </span>
                  <p className="mt-1 font-mono text-sm font-bold text-foreground">
                    {s.salaryConfig?.commission_rate ?? 0}%
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSalaryDialogFor(s)}
                  className="flex-1 rounded-full border-border/40 bg-background/50 text-xs backdrop-blur-md hover:bg-muted/50"
                >
                  <Settings className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> Salary
                </Button>
                <Button
                  size="sm"
                  onClick={() => setPayslipDialogFor(s)}
                  className="flex-1 rounded-full text-xs shadow-md"
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> Generate
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Payslip History Table */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
            <History className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Payslip History</h2>
        </div>

        {payslips.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-border/40 bg-card/40 p-12 text-center shadow-xl backdrop-blur-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/30">
              <FileX className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No payslips generated yet. Use the staff cards above to issue a payslip.
            </p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 shadow-2xl backdrop-blur-2xl">
            {/* Ambient background blur */}
            <div className="pointer-events-none absolute -bottom-32 -left-32 -z-10 h-64 w-64 rounded-full bg-primary/5 blur-[100px]" />

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border/40 bg-secondary/20">
                  <tr className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-4">Staff Member</th>
                    <th className="px-6 py-4">Month</th>
                    <th className="px-6 py-4">Net Pay</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {payslips.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-muted/10">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
                            {p.profiles?.full_name?.charAt(0).toUpperCase() ?? "S"}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{p.profiles?.full_name}</p>
                            <p className="text-xs capitalize text-muted-foreground">
                              {p.profiles?.role?.replace("_", " ")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground">
                        {format(new Date(p.month), "MMMM yyyy")}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-foreground">
                        ₹{p.net_pay.toLocaleString("en-IN")}
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(p.status)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/dashboard/owner/payroll/${p.id}/payslip`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border/40 bg-background/50 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-md transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-md"
                        >
                          <Receipt className="h-3.5 w-3.5" /> View Payslip
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Dialog Modals */}
      {salaryDialogFor && (
        <SalaryConfigDialog
          staffId={salaryDialogFor.id}
          staffName={salaryDialogFor.full_name}
          initialBase={salaryDialogFor.salaryConfig?.base_salary ?? 0}
          initialCommission={salaryDialogFor.salaryConfig?.commission_rate ?? 0}
          open={!!salaryDialogFor}
          onOpenChange={(open) => !open && setSalaryDialogFor(null)}
        />
      )}
      {payslipDialogFor && (
        <GeneratePayslipDialog
          staffId={payslipDialogFor.id}
          staffName={payslipDialogFor.full_name}
          open={!!payslipDialogFor}
          onOpenChange={(open) => !open && setPayslipDialogFor(null)}
        />
      )}
    </div>
  );
}