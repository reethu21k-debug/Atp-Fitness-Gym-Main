import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatINR } from "@/lib/utils/format";
import { getPublicMembershipPlans } from "@/lib/services/public-plans";

const UNIVERSAL_FEATURES = [
  "Full gym access",
  "QR check-in & members app",
  "Free locker usage",
  "Access to stretching area",
];

const FAQS = [
  { q: "Is there a free trial?", a: "Yes — walk in any day for a free trial session before you commit to a plan." },
  { q: "Can I upgrade my plan later?", a: "Yes, you can switch to a longer plan any time at the front desk; we'll prorate the difference." },
  { q: "Do you offer personal training separately?", a: "Yes, PT packs can be added to any membership — ask at the front desk for current rates." },
  { q: "Is there a joining fee?", a: "No joining fee this month. Ask at the front desk for current offers." },
];

export const metadata = { title: "Membership Plans — ATP Fitness" };

export default async function PricingPage() {
  const plans = await getPublicMembershipPlans();

  return (
    // Increased top padding (pt-40) to gracefully clear the floating header
    <div className="relative min-h-screen overflow-hidden bg-background px-6 pt-40 pb-24 selection:bg-primary/30">
      {/* --- Ambient Background Effects for Glassmorphism --- */}
      <div className="pointer-events-none absolute -top-40 left-0 h-96 w-96 rounded-full bg-primary/10 bg-blend-multiply blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-40 h-[30rem] w-[30rem] rounded-full bg-blue-500/5 bg-blend-multiply blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 bg-blend-multiply blur-[120px]" />

      <div className="relative z-10 mx-auto mb-20 max-w-3xl text-center">
        {/* Changed to solid text to match the image precisely */}
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Elevate Your Fitness
        </h1>
        <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
          Straightforward pricing. No per-class fees, no hidden charges. 
          Choose the plan that fits your journey.
        </p>
      </div>

      {plans.length === 0 ? (
        <p className="relative z-10 text-center text-lg text-muted-foreground">
          Plans are being updated — check back shortly.
        </p>
      ) : (
        <div className="relative z-10 mx-auto grid max-w-6xl gap-8 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={cn(
                "relative flex flex-col overflow-visible rounded-3xl transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl",
                "border-white/20 bg-background/60 shadow-xl backdrop-blur-xl dark:bg-black/40",
                plan.featured 
                  ? "border-primary shadow-[0_0_40px_-10px_rgba(var(--primary),0.2)] ring-1 ring-primary" 
                  : "border-border/50"
              )}
            >
              {plan.featured && (
                <div className="absolute -top-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-blue-500 px-4 py-1.5 text-sm font-semibold text-white shadow-lg">
                  <Sparkles className="h-4 w-4" />
                  Most Popular
                </div>
              )}
              
              <CardHeader className="text-center pb-8 pt-10">
                <CardTitle className="text-lg text-muted-foreground font-medium">{plan.name}</CardTitle>
                {/* Stacked price and period to match the layout in the image */}
                <div className="flex flex-col items-center justify-center pt-4">
                  <span className="text-5xl font-bold tracking-tighter text-foreground">
                    {formatINR(plan.price)}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground/60 mt-2">
                    {plan.periodLabel}
                  </span>
                </div>
                {plan.description && (
                  <p className="mt-4 text-xs text-muted-foreground">{plan.description}</p>
                )}
              </CardHeader>

              <CardContent className="flex flex-1 flex-col justify-between p-8 pt-0">
                <ul className="flex-1 space-y-4">
                  {UNIVERSAL_FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                      <div className="rounded-full bg-primary/10 p-1">
                        <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} />
                      </div>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 pt-6 border-t border-border/50">
                  <Button 
                    className={cn(
                      "w-full h-12 rounded-xl text-base font-semibold transition-all duration-300",
                      plan.featured 
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_20px_-5px_rgba(var(--primary),0.5)]" 
                        // Faded primary button for non-featured to match the image UI
                        : "bg-primary/40 text-primary-foreground hover:bg-primary/50 backdrop-blur-md"
                    )} 
                    asChild
                  >
                    <Link href="/contact">Book a free trial</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* --- FAQ Section --- */}
      <div className="relative z-10 mx-auto mt-32 max-w-3xl rounded-3xl border border-white/20 bg-background/60 p-8 shadow-xl backdrop-blur-xl dark:bg-black/40 sm:p-12">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-center mb-10">
          Frequently Asked Questions
        </h2>
        <div className="divide-y divide-border/50">
          {FAQS.map((f, i) => (
            <div key={i} className="group py-6 transition-all">
              <h3 className="text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                {f.q}
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {f.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}