import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Check, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// "What to expect" — three different points, so three different cards
const LEAD = {
  title: "Coaching, not just equipment",
  desc: "Anyone can rent floor space. Our trainers actually adjust your plan based on what's working — every two weeks, not once at signup.",
  tag: "Plan reviewed every two weeks",
};

const NO_PRESSURE = {
  title: "No pressure, no upselling",
  desc: "You'll never be talked into a plan you don't need. Try the floor free, then decide.",
  tag: "Free trial first",
};

const TRACKING = {
  title: "A gym you can actually track",
  desc: "Workouts, diet, and attendance — all visible to you and your trainer in the members app, not locked in a notebook at the front desk.",
  items: ["Workouts", "Diet", "Attendance"],
  caption: "In the members app",
};

const MILESTONES = [
  {
    date: "Sept 5, 2020",
    title: "Ashwath starts as a fitness trainer",
    desc: "Helping people train better and make real progress.",
  },
  {
    date: "July 2026",
    title: "ATP Fitness is founded",
    desc: "A hypertrophy-focused gym in Ananthapur.",
  },
];

const STORY = [
  {
    heading: "Built through experience. Driven by progress.",
    paragraphs: [
      "Every gym has a beginning. ATP Fitness began with years of experience, countless training sessions, and a belief that fitness should be approached with purpose.",
      "On September 5, 2020, Ashwath began his journey as a fitness trainer. At the beginning, the goal was simple — help people train better, understand their bodies, and make real progress.",
      "Over the years, that journey took him through multiple gyms and hundreds of training experiences, working with people from different backgrounds, fitness levels, and goals. From beginners stepping into a gym for the first time to people working towards significant physical transformations, every person brought a different challenge. Those experiences shaped the way Ashwath approached training.",
      "He learned that fitness isn't about blindly following workouts. It's about understanding training, technique, progression, recovery, nutrition, and consistency — and bringing them together in a way that works for the individual.",
    ],
  },
  {
    heading: "From training people to building something bigger",
    paragraphs: [
      "Years of coaching and experience created a bigger vision: a place where people could train with proper guidance, where equipment and training methods had a purpose, and where progress mattered more than simply spending time in the gym.",
      "That vision became ATP Fitness. In July 2026, Ashwath founded ATP Fitness in Ananthapur, turning years of experience as a trainer into a fitness space built around his approach to training. It was created as a hypertrophy-focused, scientifically informed, advanced unisex gym — designed for people who want to build muscle, improve their physique, increase strength, and develop a sustainable approach to fitness.",
    ],
  },
  {
    heading: "More than just a gym",
    paragraphs: [
      "Walking into a gym is only the beginning. The real difference comes from how you train, why you train, and whether your training is progressing. Our approach focuses on structured training, proper exercise execution, progressive overload, recovery, and individual goals.",
      "Whether you're starting from zero, returning to training, or looking to take your physique to the next level, the goal remains the same:",
    ],
    highlight: "Train with purpose. Track your progress. Keep improving.",
  },
  {
    heading: "The journey continues",
    paragraphs: [
      "From September 5, 2020, when Ashwath started as a trainer, to July 2026, when ATP Fitness was founded, the journey has been built one person, one workout, and one transformation at a time. What began as a passion for training has grown into a vision for a fitness community. And this is only the beginning.",
    ],
  },
];

const DIRECTIONS_URL =
  "https://www.google.com/maps/dir//ATP+Fitness,+r+Lodge,+TCR+Towers,+15%2F704,+Main+Rd,+opp.+jonna+iron+mart,+Kamalanagar,+Anantapur,+Andhra+Pradesh+515001/@17.4751744,78.413824,12z/data=!4m8!4m7!1m0!1m5!1m1!1s0x3bb14b00001c2a63:0x8f972d79a7f55ba6!2m2!1d77.6029104!2d14.6809501?entry=ttu&g_ep=EgoyMDI2MDkxNi4wIKXMDSoASAFQAw%3D%3D";

// Shared glass surface — same recipe as Pricing / Gallery
const glass =
  "border border-white/20 bg-background/60 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40";

// Hover lift only for people who haven't asked for reduced motion
const lift =
  "transition-all duration-500 motion-safe:hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none";

// Small pill used for the short "fact" on each expectation card
const tagClass =
  "inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary backdrop-blur-md";

export const metadata = {
  title: "About — ATP Fitness",
  description:
    "ATP Fitness is a hypertrophy-focused, scientifically informed gym in Kamala Nagar, Ananthapur. Read our story, see our hours, and book a free trial.",
};

export default function AboutPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 pb-20 pt-32 selection:bg-primary/30 sm:px-6 sm:pb-24 sm:pt-40">
      {/* --- Ambient Background Effects (scaled down on small screens) --- */}
      <div className="pointer-events-none absolute -top-32 -left-16 h-64 w-64 rounded-full bg-primary/10 blur-[100px] sm:-top-40 sm:left-0 sm:h-96 sm:w-96 sm:blur-[120px]" />
      <div className="pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-blue-500/5 blur-[100px] sm:right-0 sm:h-[30rem] sm:w-[30rem] sm:blur-[120px]" />
      <div className="pointer-events-none absolute -left-16 top-[55%] h-72 w-72 rounded-full bg-blue-500/5 blur-[100px] sm:left-0 sm:h-96 sm:w-96 sm:blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-[100px] sm:h-80 sm:w-80 sm:blur-[120px]" />

      {/* --- Hero --- */}
      <header className="relative z-10 mx-auto mb-14 max-w-3xl text-center sm:mb-20">
        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Train Different
        </h1>
        <p className="mt-5 text-pretty text-base text-muted-foreground sm:mt-6 sm:text-xl">
          ATP Fitness is a hypertrophy-focused, scientifically informed gym in
          Ananthapur, built for people who want real coaching, not just a card
          swipe and an empty rack.
        </p>

        {/* Primary actions — visible without scrolling */}
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button
            asChild
            className="h-12 rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.5)]"
          >
            <Link href="/contact">Book a free trial</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-12 rounded-xl border-white/20 bg-background/60 px-8 text-base font-semibold backdrop-blur-xl hover:bg-background/80 dark:border-white/10 dark:bg-black/40"
          >
            <Link href="/pricing">View membership plans</Link>
          </Button>
        </div>

        {/* Quick facts */}
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
          <li
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 shadow-sm",
              glass
            )}
          >
            <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="font-medium text-foreground">Open daily</span>
            <span className="text-muted-foreground">5 AM – 11 PM</span>
          </li>
          <li
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 shadow-sm",
              glass
            )}
          >
            <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="font-medium text-foreground">Kamala Nagar</span>
            <span className="text-muted-foreground">Ananthapur</span>
          </li>
        </ul>
      </header>

      {/* --- Our Story: milestones rail + story panel --- */}
      <section
        aria-labelledby="story-title"
        className="relative z-10 mx-auto grid max-w-6xl gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8"
      >
        {/* Milestones (sticky on large screens) */}
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className={cn("rounded-[2rem] p-6 sm:p-8", glass)}>
            <h2
              id="story-title"
              className="text-sm font-semibold text-primary"
            >
              Our story
            </h2>
            <ol className="relative mt-5 space-y-6 pl-6 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-border">
              {MILESTONES.map((m) => (
                <li key={m.date} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-6 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-primary bg-background"
                  />
                  <p className="text-sm font-semibold text-primary">{m.date}</p>
                  <p className="mt-1 font-semibold text-foreground">{m.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        {/* Story text */}
        <div className={cn("min-w-0 rounded-[2rem] p-6 sm:p-10 lg:p-12", glass)}>
          <div className="divide-y divide-border/50">
            {STORY.map((block) => (
              <article
                key={block.heading}
                className="py-8 first:pt-0 last:pb-0 sm:py-10"
              >
                <h3 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
                  {block.heading}
                </h3>
                <div className="mt-4 max-w-prose space-y-4 text-base leading-relaxed text-muted-foreground sm:mt-5 sm:text-lg">
                  {block.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                {block.highlight && (
                  <p className="mt-6 rounded-2xl border border-l-4 border-primary/20 border-l-primary bg-primary/10 px-4 py-4 text-base font-semibold text-foreground backdrop-blur-md sm:px-5 sm:text-lg">
                    {block.highlight}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --- Visit us --- */}
      <section
        aria-labelledby="visit-title"
        className="relative z-10 mx-auto mt-16 max-w-6xl sm:mt-24"
      >
        <h2
          id="visit-title"
          className="mb-8 text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl"
        >
          Come see the floor
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div
            className={cn(
              "flex flex-col justify-between gap-6 rounded-[2rem] p-6 sm:p-8",
              glass,
              lift
            )}
          >
            <div className="flex items-start gap-4">
              <div className="shrink-0 rounded-full bg-primary/10 p-3">
                <MapPin className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-foreground">
                  Kamala Nagar, Ananthapur
                </p>
                <p className="mt-1 text-muted-foreground">
                  Opp. Jonna Iron Mart, near Srikantam Circle
                </p>
              </div>
            </div>
            <Button
              asChild
              variant="outline"
              className="h-11 w-full rounded-xl border-primary/30 bg-primary/5 font-semibold text-primary hover:bg-primary hover:text-primary-foreground sm:w-auto sm:self-start"
            >
              <a href={DIRECTIONS_URL} target="_blank" rel="noopener noreferrer">
                Get directions
                <ArrowUpRight className="ml-1.5 h-4 w-4" aria-hidden />
              </a>
            </Button>
          </div>

          <div
            className={cn(
              "flex flex-col justify-between gap-6 rounded-[2rem] p-6 sm:p-8",
              glass,
              lift
            )}
          >
            <div className="flex items-start gap-4">
              <div className="shrink-0 rounded-full bg-primary/10 p-3">
                <Clock className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-foreground">
                  Open daily
                </p>
                <p className="mt-1 text-muted-foreground">5 AM – 11 PM</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Walk in any day for a free trial session — no booking needed.
            </p>
          </div>
        </div>
      </section>

      {/* --- What to expect (bento: different sizes, different content) --- */}
      <section
        aria-labelledby="values-title"
        className="relative z-10 mx-auto mt-16 max-w-6xl sm:mt-24"
      >
        <h2
          id="values-title"
          className="mb-8 text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl"
        >
          What to expect
        </h2>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {/* Lead card — biggest type, slightly tinted */}
          <div
            className={cn(
              "flex flex-col justify-between gap-10 rounded-[2rem] bg-gradient-to-br from-primary/15 to-transparent p-6 sm:p-10 md:col-span-2",
              glass,
              lift
            )}
          >
            <div>
              <h3 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl lg:leading-[1.1]">
                {LEAD.title}
              </h3>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {LEAD.desc}
              </p>
            </div>
            <span className={tagClass}>{LEAD.tag}</span>
          </div>

          {/* Secondary card — compact */}
          <div
            className={cn(
              "flex flex-col justify-between gap-10 rounded-[2rem] p-6 sm:p-8 md:col-span-2 lg:col-span-1",
              glass,
              lift
            )}
          >
            <div>
              <h3 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {NO_PRESSURE.title}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                {NO_PRESSURE.desc}
              </p>
            </div>
            <span className={tagClass}>{NO_PRESSURE.tag}</span>
          </div>

          {/* Tracking card — full width, with a peek at what's tracked */}
          <div
            className={cn(
              "flex flex-col gap-8 rounded-[2rem] p-6 sm:p-8 md:col-span-2 lg:col-span-3 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:p-10",
              glass,
              lift
            )}
          >
            <div className="min-w-0 lg:max-w-xl">
              <h3 className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
                {TRACKING.title}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
                {TRACKING.desc}
              </p>
            </div>

            <div className="w-full rounded-2xl border border-white/20 bg-background/50 p-5 backdrop-blur-md dark:border-white/10 dark:bg-black/30 lg:w-80 lg:shrink-0">
              <p className="mb-3 text-sm font-medium text-muted-foreground">
                {TRACKING.caption}
              </p>
              <ul className="divide-y divide-border/50">
                {TRACKING.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <span className="font-semibold text-foreground">{item}</span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                      <Check
                        className="h-3.5 w-3.5 text-primary"
                        strokeWidth={3}
                        aria-hidden
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* --- Final CTA --- */}
      <section
        aria-labelledby="cta-title"
        className={cn(
          "relative z-10 mx-auto mt-16 max-w-3xl rounded-[2rem] p-6 text-center sm:mt-24 sm:p-12",
          glass
        )}
      >
        <h2
          id="cta-title"
          className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl"
        >
          Try the floor before you commit
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Walk in any day for a free trial session and meet the coaching team.
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