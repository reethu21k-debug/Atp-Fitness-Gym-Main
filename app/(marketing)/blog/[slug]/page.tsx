import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type Post = {
  title: string;
  category: string;
  date: string;
  iso: string;
  body: string[];
};

// Keep newest first — prev/next navigation follows this order.
const POSTS: Record<string, Post> = {
  "first-month-in-gym": {
    title: "New to the gym? Here's what to actually focus on in month one",
    category: "Getting Started",
    date: "Jul 2, 2026",
    iso: "2026-07-02",
    body: [
      "The biggest mistake new members make isn't lifting too little — it's trying to do too much, too fast, and burning out by week three.",
      "Your first month at ATP Fitness is really about two things: learning correct form on the core lifts, and showing up consistently. Weight on the bar can wait.",
      "Book a free session with one of our trainers in your first week — they'll set a baseline plan and check your form before you start adding load.",
    ],
  },
  "protein-and-recovery": {
    title: "How much protein do you actually need? A practical guide",
    category: "Nutrition",
    date: "Jun 18, 2026",
    iso: "2026-06-18",
    body: [
      "Most people training regularly do fine around 1.6–2.2g of protein per kg of bodyweight per day — you don't need to hit the extreme numbers you see on supplement packaging.",
      "Whole food sources (eggs, dal, paneer, chicken, fish) get you most of the way there. A protein shake fills gaps, it doesn't replace meals.",
      "Ask your trainer for a diet plan tailored to your goals — cutting, maintaining, or bulking all call for different targets.",
    ],
  },
  "group-class-vs-solo": {
    title: "Group classes vs. solo training: how to pick what fits you",
    category: "Training",
    date: "Jun 4, 2026",
    iso: "2026-06-04",
    body: [
      "Group classes work well if you need external motivation and enjoy training alongside other people — the pace is set for you, which removes a lot of decision fatigue.",
      "Solo training on the strength floor suits people who want to progress a specific lift or follow a structured program at their own pace.",
      "A lot of our members do both: two or three group classes a week for cardio and community, plus solo strength sessions.",
    ],
  },
  "progress-photos-not-scale": {
    title: "Why your trainer asks for progress photos, not just your weight",
    category: "Progress",
    date: "May 22, 2026",
    iso: "2026-05-22",
    body: [
      "Body weight can swing a couple of kilos day to day from water and food alone — it's a noisy number, especially in the first few months.",
      "Photos and simple measurements (waist, arms) show changes in body composition that the scale alone won't, especially if you're gaining muscle while losing fat.",
      "We check in on progress every two weeks, not every day — that's usually enough time for a real trend to show up.",
    ],
  },
};

// Shared glass surface — same recipe as Pricing / Gallery / About / Blog
const glass =
  "border border-white/20 bg-background/60 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40";

// Hover lift only for people who haven't asked for reduced motion
const lift =
  "transition-all duration-500 motion-safe:hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background";

export function generateStaticParams() {
  return Object.keys(POSTS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS[slug];
  if (!post) return {};
  return {
    title: `${post.title} — ATP Fitness`,
    description: post.body[0],
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = POSTS[slug];
  if (!post) notFound();

  // Neighbouring posts (list is newest first)
  const slugs = Object.keys(POSTS);
  const index = slugs.indexOf(slug);
  const newerSlug = index > 0 ? slugs[index - 1] : null;
  const olderSlug = index < slugs.length - 1 ? slugs[index + 1] : null;
  const newer = newerSlug ? POSTS[newerSlug] : null;
  const older = olderSlug ? POSTS[olderSlug] : null;

  const [lead, ...rest] = post.body;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 pb-20 pt-32 selection:bg-primary/30 sm:px-6 sm:pb-24 sm:pt-40">
      {/* --- Ambient Background Effects (scaled down on small screens) --- */}
      <div className="pointer-events-none absolute -left-16 top-20 h-64 w-64 rounded-full bg-primary/5 blur-[100px] sm:-left-20 sm:h-96 sm:w-96 sm:blur-[120px]" />
      <div className="pointer-events-none absolute -right-16 top-60 h-72 w-72 rounded-full bg-blue-500/5 blur-[100px] sm:right-0 sm:h-[30rem] sm:w-[30rem] sm:blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-[100px] sm:h-80 sm:w-80 sm:blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-3xl">
        {/* Back link */}
        <Link
          href="/blog"
          className={cn(
            "group mb-8 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors duration-300 hover:text-foreground sm:mb-10",
            glass,
            focusRing
          )}
        >
          <ArrowLeft
            className="h-4 w-4 transition-transform duration-300 motion-safe:group-hover:-translate-x-1"
            aria-hidden
          />
          Back to blog
        </Link>

        {/* --- Article --- */}
        <article
          className={cn(
            "overflow-hidden rounded-[2rem] p-6 sm:p-10 lg:p-14",
            glass
          )}
        >
          <header>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-semibold text-primary backdrop-blur-md">
                {post.category}
              </span>
              <time
                dateTime={post.iso}
                className="font-medium text-muted-foreground"
              >
                {post.date}
              </time>
            </div>

            <h1 className="mt-5 text-balance text-3xl font-bold tracking-tight text-foreground sm:mt-6 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
              {post.title}
            </h1>
          </header>

          <div className="my-8 h-px w-full bg-border/60 sm:my-10" />

          {/* Body — the opening paragraph is set larger as an intro */}
          <div className="space-y-5 text-base leading-relaxed text-muted-foreground sm:space-y-6 sm:text-lg sm:leading-8">
            {lead && (
              <p className="text-lg font-medium leading-relaxed text-foreground sm:text-xl sm:leading-9">
                {lead}
              </p>
            )}
            {rest.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </article>

        {/* --- Prev / next --- */}
        {(newer || older) && (
          <nav
            aria-label="More posts"
            className="mt-6 grid gap-6 sm:grid-cols-2 sm:gap-8"
          >
            {newer && newerSlug ? (
              <Link
                href={`/blog/${newerSlug}`}
                className={cn(
                  "group flex flex-col gap-2 rounded-[2rem] p-6",
                  glass,
                  lift,
                  focusRing
                )}
              >
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <ArrowLeft
                    className="h-4 w-4 transition-transform duration-500 motion-safe:group-hover:-translate-x-1"
                    aria-hidden
                  />
                  Newer post
                </span>
                <span className="text-balance font-semibold text-foreground transition-colors duration-300 group-hover:text-primary">
                  {newer.title}
                </span>
              </Link>
            ) : (
              <div className="hidden sm:block" aria-hidden />
            )}

            {older && olderSlug && (
              <Link
                href={`/blog/${olderSlug}`}
                className={cn(
                  "group flex flex-col gap-2 rounded-[2rem] p-6 sm:items-end sm:text-right",
                  glass,
                  lift,
                  focusRing
                )}
              >
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Older post
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-500 motion-safe:group-hover:translate-x-1"
                    aria-hidden
                  />
                </span>
                <span className="text-balance font-semibold text-foreground transition-colors duration-300 group-hover:text-primary">
                  {older.title}
                </span>
              </Link>
            )}
          </nav>
        )}

        {/* --- CTA --- */}
        <aside
          className={cn(
            "mt-6 flex flex-col items-start justify-between gap-6 rounded-[2rem] p-6 sm:mt-8 sm:flex-row sm:items-center sm:p-8",
            glass
          )}
        >
          <div>
            <p className="text-lg font-semibold text-foreground sm:text-xl">
              Want a plan built around you?
            </p>
            <p className="mt-1 text-muted-foreground">
              Walk in any day for a free trial session with one of our trainers.
            </p>
          </div>
          <Button
            asChild
            className="h-12 w-full shrink-0 rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.5)] sm:w-auto"
          >
            <Link href="/contact">Book a free trial</Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}