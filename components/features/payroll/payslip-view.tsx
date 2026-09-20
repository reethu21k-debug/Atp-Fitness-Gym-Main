"use client";

import { format } from "date-fns";
import { 
  Printer, 
  MapPin, 
  User, 
  CalendarDays, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Briefcase,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PayslipData {
  month: string;
  base_salary: number;
  commission_amount: number;
  bonus_amount: number;
  deductions_amount: number;
  present_days: number | null;
  total_working_days: number | null;
  net_pay: number;
  status: string;
  profiles: { full_name: string; role: string; email: string | null } | null;
}

const getStatusBadge = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "paid" || normalized === "processed") {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-sm font-semibold text-emerald-600 backdrop-blur-md print:border-gray-300 print:bg-transparent print:text-black dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> {status}
      </span>
    );
  }
  if (normalized === "pending" || normalized === "draft") {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-sm font-semibold text-amber-600 backdrop-blur-md print:border-gray-300 print:bg-transparent print:text-black dark:text-amber-400">
        <Clock className="h-4 w-4" /> {status}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-4 py-1.5 text-sm font-semibold text-destructive backdrop-blur-md print:border-gray-300 print:bg-transparent print:text-black">
      <AlertCircle className="h-4 w-4" /> {status}
    </span>
  );
};

export function PayslipView({ 
  payslip, 
  gym 
}: { 
  payslip: PayslipData; 
  gym: { name: string; address: string | null; city: string | null } | null 
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-2 sm:p-4 print:p-0">
      
      {/* Action Bar (Hidden when printing) */}
      <div className="flex justify-end print:hidden">
        <Button 
          onClick={() => window.print()}
          className="rounded-full border border-border/40 bg-background/50 px-6 shadow-sm backdrop-blur-md transition-all hover:bg-muted/50 hover:shadow-md"
          variant="outline"
        >
          <Printer className="mr-2 h-4 w-4" /> Print Payslip
        </Button>
      </div>

      {/* Main Payslip Card - Glassmorphic on screen, standard on print */}
      <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-8 shadow-2xl backdrop-blur-2xl print:rounded-none print:border-none print:bg-white print:p-0 print:shadow-none print:backdrop-blur-none sm:p-12">
        
        {/* Ambient Screen Glows (Hidden on print) */}
        <div className="absolute -left-20 -top-20 -z-10 h-64 w-64 rounded-full bg-primary/10 blur-[80px] print:hidden" />
        <div className="absolute -bottom-20 -right-20 -z-10 h-64 w-64 rounded-full bg-secondary/20 blur-[80px] print:hidden" />

        {/* Header Section */}
        <div className="flex flex-col justify-between gap-8 border-b border-border/40 pb-8 print:border-gray-200 sm:flex-row sm:items-start">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground print:text-black">
              {gym?.name ?? "ATP Fitness"}
            </h1>
            <div className="space-y-1.5 text-sm text-muted-foreground print:text-gray-600">
              {gym?.address && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 opacity-70" />
                  {gym.address}{gym.city ? `, ${gym.city}` : ""}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-start sm:items-end sm:text-right">
            <div className="mb-4">
              {getStatusBadge(payslip.status)}
            </div>
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground print:text-black">
              <FileText className="h-5 w-5 text-muted-foreground print:hidden" />
              Salary Payslip
            </h2>
            <p className="mt-1 font-mono text-sm font-medium text-muted-foreground print:text-gray-500">
              {format(new Date(payslip.month), "MMMM yyyy")}
            </p>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 gap-6 border-b border-border/40 py-8 print:border-gray-200 sm:grid-cols-2">
          
          {/* Employee Info */}
          <div className="rounded-2xl border border-border/30 bg-secondary/20 p-5 backdrop-blur-sm print:border-none print:bg-transparent print:p-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-500">
              <User className="h-3.5 w-3.5 print:hidden" /> Employee Details
            </p>
            <p className="mt-3 text-lg font-medium text-foreground print:text-black">
              {payslip.profiles?.full_name}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm capitalize text-muted-foreground print:text-gray-600">
              <Briefcase className="h-3.5 w-3.5 opacity-70 print:hidden" />
              {payslip.profiles?.role.replace("_", " ")}
            </p>
            {payslip.profiles?.email && (
              <p className="mt-1 text-sm text-muted-foreground print:text-gray-600">
                {payslip.profiles.email}
              </p>
            )}
          </div>

          {/* Attendance Info */}
          {payslip.present_days != null && (
            <div className="rounded-2xl border border-border/30 bg-secondary/20 p-5 backdrop-blur-sm print:border-none print:bg-transparent print:p-0 sm:text-right">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-500 sm:justify-end">
                <CalendarDays className="h-3.5 w-3.5 print:hidden" /> Attendance
              </p>
              <div className="mt-3 flex items-baseline gap-1 font-mono text-xl font-bold text-foreground print:text-black sm:justify-end">
                {payslip.present_days} 
                <span className="text-sm font-medium text-muted-foreground print:text-gray-500">
                  / {payslip.total_working_days}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground print:text-gray-600">
                Days Present
              </p>
            </div>
          )}
        </div>

        {/* Earnings & Deductions Table */}
        <div className="py-8">
          <div className="overflow-hidden rounded-2xl border border-border/40 bg-background/30 backdrop-blur-md print:rounded-none print:border-none print:bg-transparent">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 print:bg-gray-100">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-600">
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 print:divide-gray-200">
                <tr className="transition-colors hover:bg-muted/10 print:hover:bg-transparent">
                  <td className="px-6 py-4 font-medium text-foreground print:text-black">Base Salary</td>
                  <td className="px-6 py-4 text-right font-mono font-medium text-foreground print:text-black">
                    ₹{payslip.base_salary.toFixed(2)}
                  </td>
                </tr>
                {payslip.commission_amount > 0 && (
                  <tr className="transition-colors hover:bg-muted/10 print:hover:bg-transparent">
                    <td className="px-6 py-4 text-muted-foreground print:text-gray-600">Commission</td>
                    <td className="px-6 py-4 text-right font-mono text-muted-foreground print:text-gray-600">
                      ₹{payslip.commission_amount.toFixed(2)}
                    </td>
                  </tr>
                )}
                {payslip.bonus_amount > 0 && (
                  <tr className="transition-colors hover:bg-muted/10 print:hover:bg-transparent">
                    <td className="px-6 py-4 text-emerald-600 print:text-gray-600 dark:text-emerald-400">Bonus</td>
                    <td className="px-6 py-4 text-right font-mono text-emerald-600 print:text-gray-600 dark:text-emerald-400">
                      ₹{payslip.bonus_amount.toFixed(2)}
                    </td>
                  </tr>
                )}
                {payslip.deductions_amount > 0 && (
                  <tr className="transition-colors hover:bg-muted/10 print:hover:bg-transparent">
                    <td className="px-6 py-4 text-destructive print:text-gray-600">Deductions</td>
                    <td className="px-6 py-4 text-right font-mono text-destructive print:text-gray-600">
                      −₹{payslip.deductions_amount.toFixed(2)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t border-border/40 bg-secondary/10 print:border-gray-300 print:bg-transparent">
                <tr>
                  <td className="px-6 py-5 text-base font-bold text-foreground print:text-black">
                    Net Pay
                  </td>
                  <td className="px-6 py-5 text-right font-mono text-xl font-bold text-foreground print:text-black">
                    ₹{payslip.net_pay.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}