import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Check,
  Dumbbell,
  HeartPulse,
  MessagesSquare,
  QrCode,
  ShieldCheck,
  Smartphone,
  Trophy,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Variant = "lead" | "default" | "panel" | "strip";

type Module = {
  icon: LucideIcon;
  title: string;
  items: string[];
  variant: Variant;
  // Column spans are written out in full so Tailwind can see them
  span?: string;
};

const MODULES: Module[] = [
  {
    icon: Dumbbell,
    title: "Strength floor",
    items: [
      "Free weights, plate-loaded machines & racks",
      "Olympic lifting platforms",
      "Functional training rig & turf",
    ],
    variant: "lead",
    span: "md:col-span-2 lg:col-span-2",
  },
  {
    icon: HeartPulse,
    title: "Personal training",
    items: [
      "Certified 1-on-1 coaches",
      "Goal-based programming",
      "Form correction & injury-safe progressions",
    ],
    variant: "default",
  },
  {
    icon: Utensils,
    title: "Diet & nutrition",
    items: [
      "Custom diet plans from your trainer",
      "Macro & calorie targets",
      "Progress check-ins every 2 weeks",
    ],
    variant: "default",
  },
  {
    icon: QrCode,
    title: "Members app",
    items: [
      "QR check-in at the front desk",
      "Workout plans & attendance history",
      "Progress photos & body-composition tracking",
    ],
    variant: "panel",
    span: "md:col-span-2 lg:col-span-2",
  },
  {
    icon: MessagesSquare,
    title: "Trainer chat",
    items: [
      "Message your trainer directly",
      "Get plan updates & feedback in-app",
    ],
    variant: "default",
  },
  {
    icon: ShieldCheck,
    title: "Safety",
    items: [
      "First-aid trained staff on every shift",
      "Equipment checked & serviced regularly",
    ],
    variant: "default",
  },
  {
    icon: Trophy,
    title: "Community",
    items: [
      "Monthly transformation challenges",
      "Member events & referral rewards",
    ],
    variant: "default",
  },
  {
    icon: Smartphone,
    title: "Billing, simplified",
    items: ["Cash, UPI, or card", "Renewal reminders before your plan lapses"],
    variant: "strip",
    span: "lg:col-span-3",
  },
];

// Shared glass surface — same recipe as Pricing / Gallery / About / Blog
const glass =
  "border border-white/20 bg-background/60 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40";

// Hover lift only for people who haven't asked for reduced motion
const lift =
  "transition-all duration-500 motion-safe:hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none";

function CheckBadge() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
      <Check className="h-3 w-3 text-primary" strokeWidth={3} aria-hidden />
    </span>
  );
}

function ItemList({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <CheckBadge />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ModuleCard({ m }: { m: Module }) {
  const Icon = m.icon;

  // Lead card: biggest heading, tinted glass, faint watermark icon
  if (m.variant === "lead") {
    return (
      <div
        className={cn(
          "relative flex flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary/15 to-transparent p-6 sm:p-10",
          glass,
          lift,
          m.span
        )}
      >
        <Icon
          aria-hidden
          strokeWidth={1}
          className="pointer-events-none absolute -bottom-8 -right-8 h-40 w-40 text-primary/10 sm:h-52 sm:w-52"
        />
        <div className="relative">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            {m.title}
          </h2>
          <ItemList
            items={m.items}
            className="mt-6 text-base text-muted-foreground sm:mt-8 sm:text-lg"
          />
        </div>
      </div>
    );
  }

  // Panel card: items sit in an inset glass list
  if (m.variant === "panel") {
    return (
      <div
        className={cn(
          "flex flex-col gap-6 rounded-[2rem] p-6 sm:p-8",
          glass,
          lift,
          m.span
        )}
      >
        <div className="flex items-center gap-2.5">
          <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {m.title}
          </h2>
        </div>
        <ul className="divide-y divide-border/50 rounded-2xl border border-white/20 bg-background/50 px-5 backdrop-blur-md dark:border-white/10 dark:bg-black/30">
          {m.items.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 py-4 text-muted-foreground"
            >
              <CheckBadge />
              <span className="font-medium text-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Strip card: full-width, heading left and items as pills
  if (m.variant === "strip") {
    return (
      <div
        className={cn(
          "flex flex-col gap-6 rounded-[2rem] p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10",
          glass,
          lift,
          m.span
        )}
      >
        <div className="flex items-center gap-2.5">
          <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {m.title}
          </h2>
        </div>
        <ul className="flex flex-wrap gap-3">
          {m.items.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2.5 rounded-full border border-primary/20 bg-primary/10 py-2 pl-3 pr-4 text-sm font-medium text-foreground backdrop-blur-md"
            >
              <Check
                className="h-4 w-4 shrink-0 text-primary"
                strokeWidth={3}
                aria-hidden
              />
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Default card
  return (
    <div
      className={cn(
        "flex flex-col rounded-[2rem] p-6 sm:p-8",
        glass,
        lift,
        m.span
      )}
    >
      <div className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {m.title}
        </h2>
      </div>
      <ItemList
        items={m.items}
        className="mt-5 text-sm text-muted-foreground sm:text-base"
      />
    </div>
  );
}

export const metadata = {
  title: "Facilities & Classes — ATP Fitness",
  description:
    "A full strength floor, personal coaching, diet plans and a members app — everything you need to train at ATP Fitness in Ananthapur.",
};

export default function FeaturesPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 pb-20 pt-32 selection:bg-primary/30 sm:px-6 sm:pb-24 sm:pt-40">
      {/* --- Ambient Background Effects (scaled down on small screens) --- */}
      <div className="pointer-events-none absolute -top-32 -left-16 h-64 w-64 rounded-full bg-primary/10 blur-[100px] sm:-top-40 sm:left-0 sm:h-96 sm:w-96 sm:blur-[120px]" />
      <div className="pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-blue-500/5 blur-[100px] sm:right-0 sm:h-[30rem] sm:w-[30rem] sm:blur-[120px]" />
      <div className="pointer-events-none absolute -left-16 top-[55%] h-72 w-72 rounded-full bg-blue-500/5 blur-[100px] sm:left-0 sm:h-96 sm:w-96 sm:blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-[100px] sm:h-80 sm:w-80 sm:blur-[120px]" />

      {/* --- Header --- */}
      <header className="relative z-10 mx-auto mb-14 max-w-3xl text-center sm:mb-20">
        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Everything You Need to Train, in One Place
        </h1>
        <p className="mt-5 text-pretty text-base text-muted-foreground sm:mt-6 sm:text-xl">
          A full strength floor, personal coaching, and a members app to track
          it all.
        </p>
      </header>

      {/* --- Modules (bento: different sizes, different treatments) --- */}
      <div className="relative z-10 mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        {MODULES.map((m) => (
          <ModuleCard key={m.title} m={m} />
        ))}
      </div>

      {/* --- Closing CTA --- */}
      <section
        aria-labelledby="features-cta"
        className={cn(
          "relative z-10 mx-auto mt-16 max-w-3xl rounded-[2rem] p-6 text-center sm:mt-24 sm:p-12",
          glass
        )}
      >
        <h2
          id="features-cta"
          className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl"
        >
          See it in person
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Walk in any day for a free trial session and try the floor before you
          commit.
        </p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button
            asChild
            className="h-12 rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.5)]"
          >
            <Link href="/contact">Book a free trial</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-12 rounded-xl px-8 text-base font-semibold text-muted-foreground hover:text-foreground"
          >
            <Link href="/pricing">See plans</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}