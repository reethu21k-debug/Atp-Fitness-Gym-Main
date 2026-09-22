"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations/auth";
import { resetPassword } from "@/lib/actions/auth.actions";
import { Lock, Link2Off, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: token ?? "" },
  });

  // No token in the URL at all — the person likely opened this page directly
  // rather than via the emailed link. Nothing to redeem, so don't show a form.
  if (!token) {
    return (
      <div className="w-full max-w-md mx-auto p-8 sm:p-10 rounded-[2rem] bg-background/40 backdrop-blur-xl border border-border/30 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
        <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col items-center space-y-3">
            <div className="flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10 border border-destructive/20 text-destructive">
              <Link2Off className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Reset link missing</h1>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                This page needs a valid reset link. Request a new one from the forgot password page.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-border/40">
            <Link
              href="/forgot-password"
              className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:underline hover:text-primary/80 transition-all group"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              Request a new link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  function onSubmit(values: ResetPasswordInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await resetPassword({ ...values, token: token! });
      if (!result.success) return setServerError(result.error);
      router.push("/login?reset=success");
    });
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 sm:p-10 rounded-[2rem] bg-background/40 backdrop-blur-xl border border-border/30 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
      <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
        
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Set a new password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a strong password you haven't used before.
          </p>
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
            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}