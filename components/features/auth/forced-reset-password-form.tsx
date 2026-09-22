"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePasswordSchema, type UpdatePasswordInput } from "@/lib/validations/auth";
import { updateOwnPassword } from "@/lib/actions/auth.actions";
import { Lock, KeyRound, Loader2 } from "lucide-react";

// Shown right after a member/staff member logs in with a temporary
// password (must_reset_password === true). Unlike ResetPasswordForm this
// needs no token in the URL -- the person's active session is the proof
// of identity, so we just call updateOwnPassword directly.
export function ForcedResetPasswordForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<UpdatePasswordInput>({ resolver: zodResolver(updatePasswordSchema) });

  function onSubmit(values: UpdatePasswordInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await updateOwnPassword(values);
      if (!result.success) return setServerError(result.error);
      // must_reset_password is now false -- bare "/dashboard" sends the
      // user to their role's home from here.
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 sm:p-10 rounded-[2rem] bg-background/40 backdrop-blur-xl border border-border/30 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
      <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
        
        {/* Header with Visual Icon Badge */}
        <div className="flex flex-col items-center text-center space-y-3 mb-6">
          <div className="flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 border border-primary/20 text-primary">
            <KeyRound className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Set your password</h1>
            <p className="text-sm text-muted-foreground">
              You're signed in with a temporary password. Choose a new one before continuing.
            </p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* New Password Field */}
          <div className="space-y-2">
            <Label htmlFor="password" className="font-medium">
              New password
            </Label>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="pl-11 h-11 bg-background/50 backdrop-blur-sm border-border/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all"
                {...form.register("password")}
              />
            </div>
            {form.formState.errors.password && (
              <p className="text-sm text-destructive animate-in fade-in">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="font-medium">
              Confirm password
            </Label>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                className="pl-11 h-11 bg-background/50 backdrop-blur-sm border-border/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all"
                {...form.register("confirmPassword")}
              />
            </div>
            {form.formState.errors.confirmPassword && (
              <p className="text-sm text-destructive animate-in fade-in">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {/* Server Error Message */}
          {serverError && (
            <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg text-center animate-in fade-in">
              {serverError}
            </p>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full h-11 text-base shadow-lg transition-all duration-300 mt-2"
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set password and continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}