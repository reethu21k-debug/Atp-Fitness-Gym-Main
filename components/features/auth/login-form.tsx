"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  emailLoginSchema,
  twoFactorVerifySchema,
  type EmailLoginInput,
  type TwoFactorVerifyInput,
} from "@/lib/validations/auth";
import { loginWithEmail, verifyTwoFactorLogin } from "@/lib/actions/auth.actions";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Mail, Lock, ShieldCheck, ArrowLeft } from "lucide-react"; // <-- Added ArrowLeft
import Link from "next/link";

type Mode = "email" | "mfa";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirectTo");
  const [mode, setMode] = useState<Mode>("email");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const emailForm = useForm<EmailLoginInput>({ resolver: zodResolver(emailLoginSchema) });
  const mfaForm = useForm<TwoFactorVerifyInput>({ resolver: zodResolver(twoFactorVerifySchema) });

  async function finishLogin() {
    router.push(redirectTo || "/dashboard");
    router.refresh();
  }

  async function onEmailSubmit(values: EmailLoginInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await loginWithEmail(values);
      if (!result.success) return setServerError(result.error);
      if (result.data?.mfaRequired) {
        const supabase = createClient();
        const { data } = await supabase.auth.mfa.listFactors();
        const totp = data?.totp?.[0];
        if (totp) {
          setMfaFactorId(totp.id);
          setMode("mfa");
          return;
        }
      }
      finishLogin();
    });
  }

  async function onMfaSubmit(values: TwoFactorVerifyInput) {
    if (!mfaFactorId) return;
    setServerError(null);
    startTransition(async () => {
      const result = await verifyTwoFactorLogin(mfaFactorId, values);
      if (!result.success) return setServerError(result.error);
      finishLogin();
    });
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 sm:p-10 rounded-[2rem] bg-background/40 backdrop-blur-xl border border-border/30 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
      
      {/* Back to Home Link */}
      <Link 
        href="/" 
        className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-6 group"
      >
        <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
        Back to home
      </Link>

      {mode === "mfa" ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="flex flex-col items-center text-center space-y-3 mb-6">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 border border-primary/20">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Two-Step Verification</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app.
              </p>
            </div>
          </div>

          <form onSubmit={mfaForm.handleSubmit(onMfaSubmit)} className="space-y-5">
            <div className="space-y-3">
              <Label htmlFor="code" className="text-center block text-sm font-medium">
                Authentication Code
              </Label>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className="text-center text-3xl tracking-[0.5em] h-16 bg-background/50 backdrop-blur-sm border-border/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all"
                {...mfaForm.register("code")}
              />
              {mfaForm.formState.errors.code && (
                <p className="text-sm text-destructive text-center animate-in fade-in">
                  {mfaForm.formState.errors.code.message}
                </p>
              )}
            </div>

            {serverError && (
              <p className="text-sm text-destructive text-center bg-destructive/10 p-2 rounded-md animate-in fade-in">
                {serverError}
              </p>
            )}

            <Button type="submit" className="w-full h-11 text-base shadow-lg transition-all duration-300" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify and continue"}
            </Button>
          </form>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to your ATP Fitness account.</p>
          </div>

          <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-medium">Email</Label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@atpfitness.in"
                  className="pl-11 h-11 bg-background/50 backdrop-blur-sm border-border/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all"
                  {...emailForm.register("email")}
                />
              </div>
              {emailForm.formState.errors.email && (
                <p className="text-sm text-destructive animate-in fade-in">
                  {emailForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="font-medium">Password</Label>
                <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline hover:text-primary/80 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-11 h-11 bg-background/50 backdrop-blur-sm border-border/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all"
                  {...emailForm.register("password")}
                />
              </div>
              {emailForm.formState.errors.password && (
                <p className="text-sm text-destructive animate-in fade-in">
                  {emailForm.formState.errors.password.message}
                </p>
              )}
            </div>

            {serverError && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg text-center animate-in fade-in">
                {serverError}
              </p>
            )}

            <Button type="submit" className="w-full h-11 text-base shadow-lg transition-all duration-300 mt-2" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground pt-4 border-t border-border/40">
            Not a member yet?{" "}
            <Link href="/contact" className="font-semibold text-primary hover:underline hover:text-primary/80 transition-colors">
              Book a free trial
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}