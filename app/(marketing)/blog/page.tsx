import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Keep newest first — the first post becomes the featured one.
const POSTS = [
  {
    slug: "first-month-in-gym",
    title: "New to the gym? Here's what to actually focus on in month one",
    excerpt: "Form and consistency beat heavy weights early on. A simple plan for your first four weeks at ATP Fitness.",
    category: "Getting Started",
    date: "Jul 2, 2026",
    iso: "2026-07-02",
  },
  {
    slug: "protein-and-recovery",
    title: "How much protein do you actually need? A practical guide",
    excerpt: "Cutting through the supplement-aisle noise with realistic targets based on your training load.",
    category: "Nutrition",
    date: "Jun 18, 2026",
    iso: "2026-06-18",
  },
  {
    slug: "group-class-vs-solo",
    title: "Group classes vs. solo training: how to pick what fits you",
    excerpt: "Some people thrive on class energy, others need quiet focus. Here's how to figure out which is you.",
    category: "Training",
    date: "Jun 4, 2026",
    iso: "2026-06-04",
  },
  {
    slug: "progress-photos-not-scale",
    title: "Why your trainer asks for progress photos, not just your weight",
    excerpt: "The scale doesn't tell the whole story. What we actually track to know a plan is working.",
    category: "Progress",
    date: "May 22, 2026",
    iso: "2026-05-22",
  },
];

// Shared glass surface — same recipe as Pricing / Gallery / About
const glass =
  "border border-white/20 bg-background/60 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40";

// Hover lift only for people who haven't asked for reduced motion
const lift =
  "transition-all duration-500 motion-safe:hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none";

const categoryClass =
  "rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary backdrop-blur-md";

// Visible keyboard focus on the whole card link
const linkClass =
  "group block h-full rounded-[2rem] outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background";

export const metadata = {
  title: "Blog — ATP Fitness",
  description:
    "Tips on training, nutrition, and recovery from the ATP Fitness coaching team in Ananthapur.",
};

export default function BlogPage() {
  const [featured, ...rest] = POSTS;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 pb-20 pt-32 selection:bg-primary/30 sm:px-6 sm:pb-24 sm:pt-40">
      {/* --- Ambient Background Effects (scaled down on small screens) --- */}
      <div className="pointer-events-none absolute -left-16 top-20 h-64 w-64 rounded-full bg-primary/5 blur-[100px] sm:-left-20 sm:h-96 sm:w-96 sm:blur-[120px]" />
      <div className="pointer-events-none absolute -right-16 top-60 h-72 w-72 rounded-full bg-blue-500/5 blur-[100px] sm:right-0 sm:h-[30rem] sm:w-[30rem] sm:blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-[100px] sm:h-80 sm:w-80 sm:blur-[120px]" />

      {/* --- Header --- */}
      <header className="relative z-10 mx-auto mb-14 max-w-3xl text-center sm:mb-20">
        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Training Notes
        </h1>
        <p className="mt-5 text-pretty text-base text-muted-foreground sm:mt-6 sm:text-xl">
          Tips on training, nutrition, and recovery from the ATP Fitness
          coaching team.
        </p>
      </header>

      {!featured ? (
        <p className="relative z-10 text-center text-lg text-muted-foreground">
          New articles are on the way — check back soon.
        </p>
      ) : (
        <div className="relative z-10 mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {/* --- Featured (latest) post --- */}
          <Link
            href={`/blog/${featured.slug}`}
            className={cn(linkClass, "sm:col-span-2 lg:col-span-3")}
          >
            <article
              className={cn(
                "flex h-full flex-col justify-between gap-10 overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary/15 to-transparent p-6 sm:p-10 lg:p-12",
                glass,
                lift
              )}
            >
              <div>
                <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                  <span className="rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground">
                    Latest
                  </span>
                  <span className={categoryClass}>{featured.category}</span>
                  <time
                    dateTime={featured.iso}
                    className="font-medium text-muted-foreground"
                  >
                    {featured.date}
                  </time>
                </div>

                <h2 className="max-w-3xl text-balance text-2xl font-bold tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary sm:text-3xl lg:text-4xl lg:leading-[1.15]">
                  {featured.title}
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {featured.excerpt}
                </p>
              </div>

              <span className="inline-flex items-center gap-2 text-base font-semibold text-primary">
                Read article
                <ArrowUpRight
                  className="h-5 w-5 transition-transform duration-500 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            </article>
          </Link>

          {/* --- Remaining posts --- */}
          {rest.map((post, i) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className={cn(
                linkClass,
                // Avoid an orphan card on the 2-column tablet grid
                rest.length % 2 === 1 &&
                  i === rest.length - 1 &&
                  "sm:col-span-2 lg:col-span-1"
              )}
            >
              <article
                className={cn(
                  "flex h-full flex-col justify-between gap-8 overflow-hidden rounded-[2rem] p-6 sm:p-8",
                  glass,
                  lift
                )}
              >
                <div>
                  <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                    <span className={categoryClass}>{post.category}</span>
                    <time
                      dateTime={post.iso}
                      className="font-medium text-muted-foreground"
                    >
                      {post.date}
                    </time>
                  </div>

                  <h2 className="text-balance text-xl font-bold tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary">
                    {post.title}
                  </h2>
                  <p className="mt-3 line-clamp-3 text-base leading-relaxed text-muted-foreground">
                    {post.excerpt}
                  </p>
                </div>

                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Read article
                  <ArrowUpRight
                    className="h-4 w-4 transition-transform duration-500 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}