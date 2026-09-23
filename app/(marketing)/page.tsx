import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { BannerCarousel } from "@/components/features/marketing/banner-carousel";
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  MapPin,
  Quote,
  ScanLine,
  Dumbbell,
  Users,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

/* ---------------------------------------------------------------------- */
/*  Content                                                               */
/* ---------------------------------------------------------------------- */

// Real pixel dimensions of each card image. Next/Image uses these to reserve
// the exact aspect ratio, so there is no cropping and no empty space.
const ROSTER = [
  {
    image: "/Home/Card1.png",
    alt: "Strength & Conditioning Floor",
    width: 1450,
    height: 596,
  },
  {
    image: "/Home/Card2.png",
    alt: "Cardio Zone",
    width: 1464,
    height: 605,
  },
  {
    image: "/Home/Card3.png",
    alt: "Elite Personal Training",
    width: 1464,
    height: 613,
  },
  {
    image: "/Home/Card4.png",
    alt: "Instant QR Check-In",
    width: 1505,
    height: 601,
  },
  {
    image: "/Home/Card5.png",
    alt: "Transparent, Simple Billing",
    width: 1938,
    height: 812,
  },
  {
    image: "/Home/Card6.png",
    alt: "Data-Driven Progress",
    width: 1479,
    height: 612,
  },
];

// Why members stay — one feature image per row, real pixel dimensions so
// Next/Image can reserve the exact aspect ratio (no crop, no stretch).
const FEATURE_CARDS = [
  {
    image: "/Home/feature_card1.png",
    alt: "Goal-first programming",
    width: 1454,
    height: 806,
    title: "Goal-first programming",
    description:
      "Every plan starts with your goal — strength, fat loss, or performance — then works backward into weekly training built around it.",
    icon: Target,
    accent: "bg-primary/10 text-primary",
  },
  {
    image: "/Home/feature_card2.png",
    alt: "Progress you can see",
    width: 1596,
    height: 779,
    title: "Progress you can see",
    description:
      "Lifts, weigh-ins, and body composition logged every session, so gains show up as numbers on a screen — not guesswork in a mirror.",
    icon: TrendingUp,
    accent: "bg-blue-500/10 text-blue-500",
  },
  {
    image: "/Home/feature_card3.png",
    alt: "Coaches on the floor, not behind a desk",
    width: 1580,
    height: 779,
    title: "Coaches on the floor, not behind a desk",
    description:
      "Certified trainers correct your form in real time and rework your plan every two weeks based on what's actually working.",
    icon: UserCheck,
    accent: "bg-primary/10 text-primary",
  },
];

const DIRECTIONS_URL = "https://maps.app.goo.gl/MgDqHjbYz5gzprad9";

// Facts shown under the hero. Keep these honest — swap in real numbers.
const HERO_STATS = [
  { icon: Dumbbell, value: "6", label: "Training zones" },
  { icon: Users, value: "1:1", label: "Certified coaching" },
  { icon: ScanLine, value: "QR", label: "Instant check-in" },
  { icon: Clock, value: "18h", label: "Open every day" },
];

// Gym is open 5 AM – 11 PM. Computed on the server in IST so it's correct
// for anyone loading the page, wherever they are.
function getOpenStatus() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(new Date())
  );
  const open = hour >= 5 && hour < 23;
  return open
    ? { open: true, label: "Open now", note: "Closes at 11 PM" }
    : { open: false, label: "Closed", note: "Opens at 5 AM" };
}

// Shared glass surface — same recipe as every other page
const glass =
  "border border-white/20 bg-background/60 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40";

// Hover lift only for people who haven't asked for reduced motion
const lift =
  "transition-all duration-500 motion-safe:hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none";

const primaryButton =
  "h-12 rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:text-primary-foreground hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.5)]";

const glassButton =
  "h-12 rounded-xl border-white/20 bg-background/60 px-8 text-base font-semibold text-foreground backdrop-blur-xl transition-all duration-300 hover:border-primary/40 hover:bg-primary/10 hover:text-primary dark:border-white/10 dark:bg-black/40 dark:text-foreground dark:hover:bg-primary/15 dark:hover:text-primary";

/* ---------------------------------------------------------------------- */
/*  Page                                                                  */
/* ---------------------------------------------------------------------- */

// The "Open now" pill depends on the current time, so this page must be
// rendered per request instead of being cached at build time.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const status = getOpenStatus();

  return (
    // FIX: pt-28/32 -> pt-24/28 so the banner sits closer to the floating header.
    // FIX: outer horizontal padding trimmed (px-3 / sm:px-4) so content uses more width.
    <div className="relative overflow-hidden bg-background px-3 pb-20 pt-24 text-foreground selection:bg-primary/30 sm:px-4 sm:pb-24 sm:pt-28">
      {/* --- Ambient Background Effects (spread down the long page) --- */}
      <div className="pointer-events-none absolute -top-32 -left-16 h-64 w-64 rounded-full bg-primary/10 blur-[100px] sm:-top-40 sm:left-0 sm:h-96 sm:w-96 sm:blur-[120px]" />
      <div className="pointer-events-none absolute -right-16 top-32 h-72 w-72 rounded-full bg-primary/10 blur-[100px] sm:right-0 sm:h-[34rem] sm:w-[34rem] sm:blur-[130px]" />
      <div className="pointer-events-none absolute -left-16 top-[38%] h-72 w-72 rounded-full bg-blue-500/5 blur-[100px] sm:left-0 sm:h-[30rem] sm:w-[30rem] sm:blur-[120px]" />
      <div className="pointer-events-none absolute -right-16 top-[62%] h-72 w-72 rounded-full bg-blue-500/5 blur-[100px] sm:right-0 sm:h-96 sm:w-96 sm:blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-[100px] sm:h-96 sm:w-96 sm:blur-[120px]" />

      {/*
        Banner
        FIX 1: max-w-6xl -> max-w-7xl so the carousel fills more of the screen
               (removes the wide empty bars on the left and right).
        FIX 2: [&>*]:bg-transparent [&>*]:p-0 strips any white background/padding
               the carousel's own outer wrapper adds, which caused the white box
               and the big gap above the card.
        FIX 3: -mt-4 pulls it up slightly toward the header.
      */}
      <div className="relative z-10 mx-auto -mt-4 mb-10 w-full max-w-7xl bg-transparent sm:mb-14 [&>*]:bg-transparent [&>*]:p-0">
        <BannerCarousel />
      </div>

      {/* ================================================================ */}
      {/*  HERO                                                            */}
      {/* ================================================================ */}
      <section
        aria-labelledby="hero-title"
        className="relative z-10 mx-auto max-w-7xl"
      >
        {/*
          Mascot shows at every breakpoint: small and above the headline on
          mobile, full size in its own column to the right on desktop
          (two-column split from lg up).
        */}
        <div className="grid items-center gap-2 lg:grid-cols-[1.08fr_0.92fr] lg:gap-4">
          {/*
            Mascot — shown on every breakpoint now. Small and up top on
            mobile (so it doesn't shove the CTA far down the fold), full
            size in its own column on desktop. `unoptimized` preserves the
            GIF's animation (Next/Image would otherwise flatten it to one
            static frame).
          */}
          <div className="relative order-first mx-auto -mb-2 w-40 sm:w-48 lg:order-last lg:mx-0 lg:mb-0 lg:w-auto">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent blur-2xl sm:h-48 sm:w-48 lg:h-[22rem] lg:w-[22rem]" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10 lg:block" />
            <Image
              src="/weightlifter-transparent.gif"
              alt="Cartoon illustration of a weightlifter mid-press, representing the strength floor"
              width={1600}
              height={1200}
              unoptimized
              priority
              className="relative mx-auto h-auto w-full drop-shadow-2xl lg:w-[85%] lg:max-w-sm xl:max-w-md"
            />
          </div>

          <div className="mx-auto max-w-4xl text-center lg:mx-0 lg:max-w-none lg:text-left">
            {/* Live status pill — reflects the real opening hours */}
            <div
              className={cn(
                "mx-auto inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-semibold lg:mx-0",
                glass
              )}
            >
              <span className="relative flex h-2 w-2">
                {status.open && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 motion-safe:animate-ping" />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    status.open ? "bg-emerald-500" : "bg-muted-foreground"
                  )}
                />
              </span>
              <span className="text-foreground">{status.label}</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium text-muted-foreground">
                {status.note}
              </span>
            </div>

            <h1
              id="hero-title"
              className="mt-8 text-balance font-bold tracking-tighter text-foreground"
            >
              <span className="block text-6xl leading-[0.95] sm:text-7xl lg:text-7xl xl:text-8xl">
                Train{" "}
                <span className="relative inline-block text-primary">
                  Different.
                  {/* hand-drawn style underline */}
                  <svg
                    aria-hidden
                    viewBox="0 0 300 14"
                    preserveAspectRatio="none"
                    className="absolute -bottom-1 left-0 h-2.5 w-full text-primary/40 sm:h-3"
                  >
                    <path
                      d="M2 9 C 60 2, 120 13, 180 6 S 260 4, 298 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </span>
              <span className="mt-6 block text-xl font-medium tracking-tight text-muted-foreground sm:text-2xl lg:text-3xl">
                Anantapur&apos;s elite strength floor.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground lg:mx-0 sm:text-lg">
              An uncompromising strength floor and certified personal coaching
              — backed by a member app that logs every rep, meal, and
              milestone.
            </p>

            <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
              <Button asChild className={cn(primaryButton, "h-14 px-9 text-lg")}>
                <Link href="/contact" className="flex items-center gap-2">
                  Book a free trial <ArrowRight className="h-5 w-5" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className={cn(glassButton, "h-14 text-lg")}
              >
                <Link href="/pricing">See membership plans</Link>
              </Button>
            </div>

            <p className="mt-5 text-sm text-muted-foreground">
              First session on us · Drop in anytime for a guided tour.
            </p>
          </div>

        </div>

        {/* Stat strip — one glass bar instead of four separate boxes */}
        <ul
          className={cn(
            "mx-auto mt-14 grid max-w-5xl grid-cols-2 overflow-hidden rounded-[1.75rem] sm:mt-16 lg:grid-cols-4",
            glass
          )}
        >
          {HERO_STATS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li
                key={s.label}
                className={cn(
                  "flex items-center gap-4 px-5 py-5 sm:px-6 sm:py-6",
                  // dividers: vertical between items, horizontal on the mobile 2nd row
                  i % 2 === 1 && "border-l border-border/60",
                  i > 1 && "border-t border-border/60 lg:border-t-0",
                  i > 0 && "lg:border-l lg:border-border/60"
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="text-left">
                  <p className="text-2xl font-bold leading-none tracking-tight text-foreground">
                    {s.value}
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {s.label}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ================================================================ */}
      {/*  EVERYTHING ON THE FLOOR                                         */}
      {/* ================================================================ */}
      <section
        aria-labelledby="floor-title"
        className="relative z-10 mx-auto mt-24 max-w-7xl sm:mt-32"
      >
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <h2
            id="floor-title"
            className="text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
          >
            Everything on the floor
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
            No fluff. World-class equipment, data-driven accountability, and
            coaching that shows up.
          </p>
        </div>

        {/*
          The image IS the card: no padded glass wrapper, so no extra space
          around it. Each image renders at its own real aspect ratio
          (h-auto + width/height from ROSTER), so nothing is cropped and
          nothing is letterboxed. Two columns on desktop keep the wide
          ~2.4:1 cards large and readable.
        */}
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:items-start lg:gap-8">
          {ROSTER.map((f) => (
            <div
              key={f.image}
              className={cn(
                "overflow-hidden rounded-[1.75rem] ring-1 ring-white/20 shadow-xl dark:ring-white/10",
                lift
              )}
            >
              <Image
                src={f.image}
                alt={f.alt}
                width={f.width}
                height={f.height}
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 600px"
                className="block h-auto w-full"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ================================================================ */}
      {/*  WHY MEMBERS STAY                                                */}
      {/* ================================================================ */}
      <section
        aria-labelledby="benefits-title"
        className="relative z-10 mx-auto mt-20 max-w-7xl sm:mt-28"
      >
        <div className={cn("rounded-[2rem] p-6 sm:p-10 lg:p-14", glass)}>
          <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
            <h2
              id="benefits-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
            >
              Why members stay
            </h2>
            <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
              Not another card swipe and an empty rack — a floor built around
              your goals, your progress, and your time.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3 sm:gap-8">
            {FEATURE_CARDS.map((f) => (
              <div
                key={f.image}
                className={cn(
                  "overflow-hidden rounded-3xl bg-background/40 ring-1 ring-white/10 backdrop-blur-md dark:ring-white/10",
                  lift
                )}
              >
                <Image
                  src={f.image}
                  alt={f.alt}
                  width={f.width}
                  height={f.height}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="block h-auto w-full"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/*  MEMBER STORY                                                    */}
      {/* ================================================================ */}
      <section
        aria-labelledby="story-title"
        className="relative z-10 mx-auto mt-20 max-w-7xl sm:mt-28"
      >
        <h2 id="story-title" className="sr-only">
          Member story
        </h2>

        <figure
          className={cn(
            "relative overflow-visible rounded-[2rem] bg-gradient-to-br from-primary/15 to-transparent p-6 sm:p-10 lg:p-14",
            glass
          )}
        >
          <span className="absolute -top-3 right-6 rotate-3 rounded-full border border-primary/30 bg-background px-4 py-1.5 text-sm font-bold text-primary shadow-lg sm:right-10">
            New PR
          </span>

          <Quote
            aria-hidden
            strokeWidth={1}
            className="pointer-events-none absolute -bottom-6 right-4 h-40 w-40 text-primary/10 sm:h-56 sm:w-56"
          />

          <div className="relative grid items-center gap-8 lg:grid-cols-[auto_1fr] lg:gap-14">
            {/* Result */}
            <div className="text-center lg:text-left">
              <p className="text-7xl font-bold tracking-tighter text-primary sm:text-8xl">
                −8
                <span className="ml-1 text-3xl font-semibold tracking-tight sm:text-4xl">
                  kg
                </span>
              </p>
              <p className="mt-2 text-base font-medium text-muted-foreground sm:text-lg">
                in 6 months
              </p>
            </div>

            {/* Quote */}
            <div>
              <blockquote className="text-balance text-xl font-medium leading-relaxed text-foreground sm:text-2xl lg:text-3xl lg:leading-snug">
                &ldquo;Six months in and I&apos;ve dropped 8kg. My trainer
                adjusts my plan every two weeks based on what&apos;s actually
                working. The atmosphere here is unmatched.&rdquo;
              </blockquote>

              <figcaption className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-foreground">Karthik R.</p>
                  <p className="text-sm text-muted-foreground">
                    Verified member · Anantapur
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  className={cn(glassButton, "sm:w-auto")}
                >
                  <Link href="/testimonials">Read more transformations</Link>
                </Button>
              </figcaption>
            </div>
          </div>
        </figure>
      </section>

      {/* ================================================================ */}
      {/*  FINAL CTA                                                       */}
      {/* ================================================================ */}
      <section
        aria-labelledby="cta-title"
        className={cn(
          "relative z-10 mx-auto mt-20 max-w-4xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary/15 via-transparent to-transparent p-6 text-center sm:mt-28 sm:p-12 lg:p-16",
          glass
        )}
      >
        <h2
          id="cta-title"
          className="text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-6xl"
        >
          Ready to commit?
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Step onto the floor for a free trial session. Test the equipment, feel
          the culture, meet your future coaches — zero pressure.
        </p>

        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button asChild className={cn(primaryButton, "h-14 px-10 text-lg")}>
            <Link href="/contact" className="flex items-center gap-2">
              Claim your free trial <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className={cn(glassButton, "h-14 text-lg")}
          >
            <a href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">
              Get directions
              <ArrowUpRight className="ml-1.5 h-5 w-5" aria-hidden />
            </a>
          </Button>
        </div>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
          <li className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 font-medium text-foreground backdrop-blur-md">
            <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            Open daily · 5 AM – 11 PM
          </li>
          <li className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 font-medium text-foreground backdrop-blur-md">
            <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            Kamala Nagar, Ananthapur
          </li>
        </ul>
      </section>
    </div>
  );
}