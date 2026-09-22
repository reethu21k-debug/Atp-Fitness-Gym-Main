"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";
import { forgotPassword } from "@/lib/actions/auth.actions";
import { MailCheck, Mail, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  function onSubmit(values: ForgotPasswordInput) {
    startTransition(async () => {
      await forgotPassword(values);
      setSent(true);
    });
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 sm:p-10 rounded-[2rem] bg-background/40 backdrop-blur-xl border border-border/30 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
      {sent ? (
        <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col items-center space-y-3">
            <div className="flex items-center justify-center h-16 w-16 rounded-full bg-success/10 border border-success/20 text-success">
              <MailCheck className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                If an account exists for that address, we've sent a link to reset your password.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-border/40">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:underline hover:text-primary/80 transition-all group"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              Back to sign in
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Reset password</h1>
            <p className="text-sm text-muted-foreground">
              Enter your email address and we'll send you a password reset link.
            </p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-medium">
                Email
              </Label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@atpfitness.in"
                  className="pl-11 h-11 bg-background/50 backdrop-blur-sm border-border/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all"
                  {...form.register("email")}
                />
              </div>
              {form.formState.errors.email && (
                <p className="text-sm text-destructive animate-in fade-in">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base shadow-lg transition-all duration-300 mt-2"
              disabled={isPending}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
            </Button>
          </form>

          <div className="pt-4 text-center border-t border-border/40">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:underline hover:text-primary/80 transition-all group"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              Back to sign in
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}