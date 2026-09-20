"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  Settings, 
  IndianRupee, 
  Percent, 
  AlertCircle, 
  Wallet 
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
import { upsertSalaryConfig } from "@/lib/actions/payroll.actions";

export function SalaryConfigDialog({
  staffId, 
  staffName, 
  initialBase, 
  initialCommission, 
  open, 
  onOpenChange,
}: {
  staffId: string; 
  staffName: string; 
  initialBase: number; 
  initialCommission: number; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [base, setBase] = useState(String(initialBase));
  const [commission, setCommission] = useState(String(initialCommission));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await upsertSalaryConfig(staffId, Number(base), Number(commission));
      if (!result.success) return setError(result.error);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="relative overflow-hidden border border-border/40 bg-card/60 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-[440px] sm:rounded-[2rem]">
        
        {/* Ambient Background Glows */}
        <div className="pointer-events-none absolute -left-20 -top-20 -z-10 h-48 w-48 rounded-full bg-primary/20 blur-[80px]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 -z-10 h-48 w-48 rounded-full bg-secondary/30 blur-[80px]" />

        {/* Header */}
        <DialogHeader className="border-b border-border/30 bg-background/30 p-6 pb-6 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 shadow-inner">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1 text-left">
              <DialogTitle className="text-xl font-bold tracking-tight">Salary Configuration</DialogTitle>
              <DialogDescription className="text-sm font-medium text-foreground">
                For <span className="font-semibold text-primary">{staffName}</span>
              </DialogDescription>
            </div>
          </div>
          <p className="mt-4 text-left text-xs text-muted-foreground">
            Configure the base monthly salary and commission rate earned on payments they process.
          </p>
        </DialogHeader>

        {/* Form Body */}
        <div className="space-y-5 p-6">
          <div className="space-y-4 rounded-2xl border border-border/30 bg-secondary/10 p-4">
            
            {/* Base Salary Input */}
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Base Salary
                <IndianRupee className="h-3 w-3 opacity-50" />
              </Label>
              <div className="relative">
                <IndianRupee className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  type="number" 
                  value={base} 
                  onChange={(e) => setBase(e.target.value)}
                  className="h-11 rounded-xl border-border/40 bg-background/50 pl-10 font-mono shadow-sm backdrop-blur-sm transition-all focus:bg-background" 
                />
              </div>
            </div>

            {/* Commission Rate Input */}
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Commission Rate
                <Percent className="h-3 w-3 opacity-50" />
              </Label>
              <div className="relative">
                <Percent className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  type="number" 
                  step="0.1" 
                  value={commission} 
                  onChange={(e) => setCommission(e.target.value)}
                  className="h-11 rounded-xl border-border/40 bg-background/50 pl-10 font-mono shadow-sm backdrop-blur-sm transition-all focus:bg-background" 
                />
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
            className="w-full rounded-full border-border/40 bg-background/50 backdrop-blur-md hover:bg-muted/50 sm:w-auto"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            loading={isPending}
            className="mt-2 w-full rounded-full shadow-md sm:mt-0 sm:w-auto"
          >
            Save Configuration
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}