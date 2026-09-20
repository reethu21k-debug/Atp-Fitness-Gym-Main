"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { 
  Calculator, 
  CalendarDays, 
  UserCheck, 
  Briefcase, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  IndianRupee,
  Receipt
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generatePayslip } from "@/lib/actions/payroll.actions";

export function GeneratePayslipDialog({ 
  staffId, 
  staffName, 
  open, 
  onOpenChange 
}: { 
  staffId: string; 
  staffName: string; 
  open: boolean; 
  onOpenChange: (open: boolean) => void 
}) {
  const router = useRouter();
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM-01"));
  const [bonus, setBonus] = useState("0");
  const [deductions, setDeductions] = useState("0");
  const [presentDays, setPresentDays] = useState("");
  const [totalWorkingDays, setTotalWorkingDays] = useState("26");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await generatePayslip({
        staffId,
        month,
        bonus: Number(bonus),
        deductions: Number(deductions),
        presentDays: presentDays ? Number(presentDays) : undefined,
        totalWorkingDays: totalWorkingDays ? Number(totalWorkingDays) : undefined,
      });
      if (!result.success) return setError(result.error);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="relative overflow-hidden border border-border/40 bg-card/60 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-[480px] sm:rounded-[2rem]">
        
        {/* Ambient Background Glows */}
        <div className="pointer-events-none absolute -left-20 -top-20 -z-10 h-48 w-48 rounded-full bg-primary/20 blur-[80px]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 -z-10 h-48 w-48 rounded-full bg-secondary/30 blur-[80px]" />

        {/* Header */}
        <DialogHeader className="border-b border-border/30 bg-background/30 p-6 pb-6 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 shadow-inner">
              <Receipt className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1 text-left">
              <DialogTitle className="text-xl font-bold tracking-tight">Generate Payslip</DialogTitle>
              <DialogDescription className="text-sm font-medium text-foreground">
                For <span className="font-semibold text-primary">{staffName}</span>
              </DialogDescription>
            </div>
          </div>
          <p className="mt-4 text-left text-xs text-muted-foreground">
            Commission is calculated automatically from payments they processed during this billing month.
          </p>
        </DialogHeader>

        {/* Form Body */}
        <div className="space-y-6 p-6">
          
          {/* Payroll Period */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> Payroll Period
            </Label>
            <Input 
              type="month" 
              value={month.slice(0, 7)} 
              onChange={(e) => setMonth(`${e.target.value}-01`)}
              className="h-11 rounded-xl border-border/40 bg-background/50 shadow-sm backdrop-blur-sm transition-all focus:bg-background"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Attendance Container */}
            <div className="col-span-2 space-y-4 rounded-2xl border border-border/30 bg-secondary/10 p-4 sm:col-span-1">
              <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5" /> Attendance
              </Label>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Present Days</Label>
                  <Input 
                    type="number" 
                    value={presentDays} 
                    onChange={(e) => setPresentDays(e.target.value)} 
                    placeholder="Optional" 
                    className="h-10 rounded-lg border-border/40 bg-background/50 shadow-sm backdrop-blur-sm transition-all focus:bg-background"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center justify-between">
                    Total Days
                    <Briefcase className="h-3 w-3 opacity-50" />
                  </Label>
                  <Input 
                    type="number" 
                    value={totalWorkingDays} 
                    onChange={(e) => setTotalWorkingDays(e.target.value)}
                    className="h-10 rounded-lg border-border/40 bg-background/50 shadow-sm backdrop-blur-sm transition-all focus:bg-background" 
                  />
                </div>
              </div>
            </div>

            {/* Adjustments Container */}
            <div className="col-span-2 space-y-4 rounded-2xl border border-border/30 bg-secondary/10 p-4 sm:col-span-1">
              <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Calculator className="h-3.5 w-3.5" /> Adjustments
              </Label>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                    Bonus
                    <TrendingUp className="h-3 w-3" />
                  </Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input 
                      type="number" 
                      value={bonus} 
                      onChange={(e) => setBonus(e.target.value)}
                      className="h-10 rounded-lg border-border/40 bg-background/50 pl-8 font-mono shadow-sm backdrop-blur-sm transition-all focus:bg-background" 
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-destructive flex items-center justify-between">
                    Deductions
                    <TrendingDown className="h-3 w-3" />
                  </Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input 
                      type="number" 
                      value={deductions} 
                      onChange={(e) => setDeductions(e.target.value)}
                      className="h-10 rounded-lg border-border/40 bg-background/50 pl-8 font-mono shadow-sm backdrop-blur-sm transition-all focus:bg-background" 
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive backdrop-blur-md">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-border/30 bg-background/30 p-6 pt-4 backdrop-blur-md sm:justify-end">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="rounded-full border-border/40 bg-background/50 backdrop-blur-md hover:bg-muted/50 w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            loading={isPending}
            className="rounded-full shadow-md w-full sm:w-auto mt-2 sm:mt-0"
          >
            Generate Payslip
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}