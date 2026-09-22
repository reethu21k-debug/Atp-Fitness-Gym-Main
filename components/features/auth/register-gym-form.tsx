"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerGymSchema, type RegisterGymInput } from "@/lib/validations/auth";
import { registerGym } from "@/lib/actions/auth.actions";
import { User, Dumbbell, Mail, Phone, MapPin, Lock, Loader2 } from "lucide-react";
import Link from "next/link";

export function RegisterGymForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<RegisterGymInput>({
    resolver: zodResolver(registerGymSchema),
  });

  function onSubmit(values: RegisterGymInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await registerGym(values);
      if (!result.success) return setServerError(result.error);
      router.push("/dashboard/owner");
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-8 sm:p-10 rounded-[2rem] bg-background/40 backdrop-blur-xl border border-border/30 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Set up your ATP Fitness account</h1>
          <p className="text-sm text-muted-foreground">
            Create the owner account for ATP Fitness on the platform.
          </p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Owner Name */}
            <div className="space-y-2">
              <Label htmlFor="ownerName" className="font-medium">Your name</Label>
              <div className="relative group">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                <Input 
                  id="ownerName" 
                  placeholder="Full name" 
                  className="pl-11 h-11 bg-background/50 backdrop-blur-sm border-border/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all"
                  {...form.register("ownerName")} 
                />
              </div>
              {form.formState.errors.ownerName && (
                <p className="text-sm text-destructive animate-in fade-in">{form.formState.errors.ownerName.message}</p>
              )}
            </div>

            {/* Gym Name */}
            <div className="space-y-2">
              <Label htmlFor="gymName" className="font-medium">Gym name</Label>
              <div className="relative group">
                <Dumbbell className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                <Input 
                  id="gymName" 
                  placeholder="ATP Fitness" 
                  className="pl-11 h-11 bg-background/50 backdrop-blur-sm border-border/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all"
                  {...form.register("gymName")} 
                />
              </div>
              {form.formState.errors.gymName && (
                <p className="text-sm text-destructive animate-in fade-in">{form.formState.errors.gymName.message}</p>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="font-medium">Work email</Label>
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
              <p className="text-sm text-destructive animate-in fade-in">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="font-medium">Phone</Label>
              <div className="relative group">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                <Input 
                  id="phone" 
                  placeholder="+91 98765 43210" 
                  className="pl-11 h-11 bg-background/50 backdrop-blur-sm border-border/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all"
                  {...form.register("phone")} 
                />
              </div>
              {form.formState.errors.phone && (
                <p className="text-sm text-destructive animate-in fade-in">{form.formState.errors.phone.message}</p>
              )}
            </div>

            {/* City */}
            <div className="space-y-2">
              <Label htmlFor="city" className="font-medium">City</Label>
              <div className="relative group">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                <Input 
                  id="city" 
                  placeholder="Anantapur" 
                  className="pl-11 h-11 bg-background/50 backdrop-blur-sm border-border/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-transparent transition-all"
                  {...form.register("city")} 
                />
              </div>
              {form.formState.errors.city && (
                <p className="text-sm text-destructive animate-in fade-in">{form.formState.errors.city.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="font-medium">Password</Label>
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
                <p className="text-sm text-destructive animate-in fade-in">{form.formState.errors.password.message}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-medium">Confirm</Label>
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
                <p className="text-sm text-destructive animate-in fade-in">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          {/* Terms and Conditions */}
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3">
              <div className="flex items-center h-5">
                <input
                  id="agreeToTerms"
                  type="checkbox"
                  className="h-4 w-4 rounded border-border/50 bg-background/50 text-primary focus:ring-primary focus:ring-offset-background transition-all cursor-pointer"
                  {...form.register("agreeToTerms")}
                />
              </div>
              <Label htmlFor="agreeToTerms" className="text-sm font-normal text-muted-foreground leading-snug cursor-pointer">
                I agree to the{" "}
                <Link href="/terms" className="text-primary hover:underline font-medium transition-colors">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-primary hover:underline font-medium transition-colors">
                  Privacy Policy
                </Link>
                .
              </Label>
            </div>
            {form.formState.errors.agreeToTerms && (
              <p className="text-sm text-destructive animate-in fade-in">{form.formState.errors.agreeToTerms.message}</p>
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
            className="w-full h-11 text-base shadow-lg transition-all duration-300 mt-4" 
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create account"}
          </Button>
        </form>

        {/* Footer Link */}
        <div className="pt-6 text-center border-t border-border/40">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline hover:text-primary/80 transition-all">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}