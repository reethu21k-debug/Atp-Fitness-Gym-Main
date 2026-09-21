import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatINR } from "@/lib/utils/format";
import { getPublicMembershipPlans } from "@/lib/services/public-plans";

const UNIVERSAL_FEATURES = [
  "Full gym access",
  "QR check-in & members app",
];

const REASSURANCES = [
  "Free trial session",
  "No per-class fees",
  "No hidden charges",
];

const FAQS = [
  { q: "Is there a free trial?", a: "Yes — walk in any day for a free trial session before you commit to a plan." },
  { q: "Can I upgrade my plan later?", a: "Yes, you can switch to a longer plan any time at the front desk; we'll prorate the difference." },
  { q: "Do you offer personal training separately?", a: "Yes, PT packs can be added to any membership — ask at the front desk for current rates." },
  { q: "Is there a joining fee?", a: "No joining fee this month. Ask at the front desk for current offers." },
];

// Matches the 1-year plan by its name or period label, e.g. "1 Year", "12 Months", "Yearly", "per year"
const YEARLY_PLAN = /(12\s*-?\s*months?|1\s*-?\s*year|one\s*year|yearly|annual|per\s*year|\/\s*year)/i;

// Shared glass surface — same recipe as About / Blog / Features / Gallery
const glass =
  "border border-white/20 bg-background/60 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40";

export const metadata = {
  title: "Membership Plans — ATP Fitness",
  description:
    "Straightforward gym membership plans at ATP Fitness, Ananthapur. No per-class fees, no hidden charges. Book a free trial.",
};

export default async function PricingPage() {
  const plans = await getPublicMembershipPlans();

  // Highlight exactly one plan: the 1-year plan. If none is found, fall back to
  // whatever the data marks as featured so the page never shows two badges.
  const featuredId =
    plans.find((p) => YEARLY_PLAN.test(`${p.name} ${p.periodLabel}`))?.id ??
    plans.find((p) => p.featured)?.id;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 pb-20 pt-32 selection:bg-primary/30 sm:px-6 sm:pb-24 sm:pt-40">
      {/* --- Ambient Background Effects (scaled down on small screens) --- */}
      <div className="pointer-events-none absolute -top-32 -left-16 h-64 w-64 rounded-full bg-primary/10 blur-[100px] sm:-top-40 sm:left-0 sm:h-96 sm:w-96 sm:blur-[120px]" />
      <div className="pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-blue-500/5 blur-[100px] sm:right-0 sm:h-[30rem] sm:w-[30rem] sm:blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-[100px] sm:h-80 sm:w-80 sm:blur-[120px]" />

      {/* --- Header --- */}
      <header className="relative z-10 mx-auto mb-14 max-w-3xl text-center sm:mb-20">
        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Elevate Your Fitness
        </h1>
        <p className="mt-5 text-pretty text-base text-muted-foreground sm:mt-6 sm:text-xl">
          Straightforward pricing. No per-class fees, no hidden charges. Choose
          the plan that fits your journey.
        </p>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
          {REASSURANCES.map((r) => (
            <li
              key={r}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 font-medium text-foreground shadow-sm",
                glass
              )}
            >
              <Check
                className="h-4 w-4 shrink-0 text-primary"
                strokeWidth={3}
                aria-hidden
              />
              {r}
            </li>
          ))}
        </ul>
      </header>

      {/* --- Plans --- */}
      {plans.length === 0 ? (
        <p className="relative z-10 text-center text-lg text-muted-foreground">
          Plans are being updated — check back shortly.
        </p>
      ) : (
        <div className="relative z-10 mx-auto grid max-w-6xl gap-x-6 gap-y-10 md:grid-cols-2 lg:grid-cols-3 lg:gap-x-8">
          {plans.map((plan, index) => {
            const isFeatured = plan.id === featuredId;
            // Centre a lone last card on the 2-column tablet grid
            const isOrphan = plans.length % 2 === 1 && index === plans.length - 1;

            return (
              <Card
                key={plan.id}
                className={cn(
                  "relative flex flex-col overflow-visible rounded-[2rem] transition-all duration-500 motion-safe:hover:-translate-y-2 hover:shadow-2xl motion-reduce:transition-none",
                  "border-white/20 bg-background/60 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40",
                  isFeatured
                    ? "border-primary shadow-[0_0_40px_-10px_hsl(var(--primary)/0.35)] ring-1 ring-primary"
                    : "border-border/50",
                  isOrphan &&
                    "md:col-span-2 md:mx-auto md:w-full md:max-w-[calc(50%-0.75rem)] lg:col-span-1 lg:max-w-none"
                )}
              >
                {isFeatured && (
                  <div className="absolute -top-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-primary to-blue-500 px-4 py-1.5 text-sm font-semibold text-white shadow-lg">
                    <Sparkles className="h-4 w-4" aria-hidden />
                    Most Popular
                  </div>
                )}

                <CardHeader className="pb-6 pt-10 text-center sm:pb-8">
                  <CardTitle className="text-lg font-medium text-muted-foreground">
                    {plan.name}
                  </CardTitle>
                  <div className="flex flex-col items-center justify-center pt-4">
                    <span className="text-4xl font-bold tracking-tighter text-foreground sm:text-5xl">
                      {formatINR(plan.price)}
                    </span>
                    <span className="mt-2 text-sm font-medium text-muted-foreground">
                      {plan.periodLabel}
                    </span>
                  </div>
                  {plan.description && (
                    <p className="mt-4 text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="flex flex-1 flex-col justify-between p-6 pt-0 sm:p-8 sm:pt-0">
                  <div className="flex-1">
                    <p className="mb-4 text-sm font-semibold text-foreground">
                      Every plan includes
                    </p>
                    <ul className="space-y-3.5">
                      {UNIVERSAL_FEATURES.map((f) => (
                        <li
                          key={f}
                          className="flex items-center gap-3 text-sm font-medium text-muted-foreground"
                        >
                          <span className="rounded-full bg-primary/10 p-1">
                            <Check
                              className="h-3.5 w-3.5 text-primary"
                              strokeWidth={3}
                              aria-hidden
                            />
                          </span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-8 border-t border-border/50 pt-6">
                    <Button
                      className={cn(
                        "h-12 w-full rounded-xl text-base font-semibold transition-all duration-300",
                        isFeatured
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.5)]"
                          : "bg-primary/40 text-primary-foreground backdrop-blur-md hover:bg-primary/50"
                      )}
                      asChild
                    >
                      <Link href="/contact">
                        <span className="sr-only">{plan.name}: </span>
                        Book a free trial
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* --- FAQ (native accordion, works without JavaScript) --- */}
      <section
        aria-labelledby="faq-title"
        className={cn(
          "relative z-10 mx-auto mt-16 max-w-3xl rounded-[2rem] p-6 sm:mt-24 sm:p-10 lg:p-12",
          glass
        )}
      >
        <h2
          id="faq-title"
          className="mb-6 text-balance text-center text-2xl font-bold tracking-tight text-foreground sm:mb-8 sm:text-3xl lg:text-4xl"
        >
          Frequently Asked Questions
        </h2>

        <div className="divide-y divide-border/50">
          {FAQS.map((f, i) => (
            <details
              key={f.q}
              open={i === 0}
              className="[&[open]_.chev]:rotate-180"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-5 text-left text-base font-semibold text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary sm:text-lg [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown
                  className="chev h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="pb-5 leading-relaxed text-muted-foreground sm:text-lg">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}