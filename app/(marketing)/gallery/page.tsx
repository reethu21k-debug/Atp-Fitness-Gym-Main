import { Camera, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const CATEGORIES = [
  { label: "Strength floor", gradient: "from-indigo-500 via-purple-500 to-violet-600" },
  { label: "Cardio zone", gradient: "from-sky-400 via-cyan-500 to-teal-500" },
  { label: "Transformation stories", gradient: "from-amber-400 via-orange-500 to-red-500" },
  { label: "Trainer sessions", gradient: "from-emerald-400 via-emerald-500 to-teal-600" },
  { label: "Community events", gradient: "from-rose-400 via-rose-500 to-red-600" },
  { label: "Recovery & stretch", gradient: "from-purple-400 via-fuchsia-500 to-indigo-500" },
];

export const metadata = { title: "Gallery — ATP Fitness" };

export default function GalleryPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 pt-40 pb-24 selection:bg-primary/30">
      {/* --- Ambient Background Effects for Glassmorphism --- */}
      <div className="pointer-events-none absolute -top-40 left-0 h-96 w-96 rounded-full bg-primary/10 bg-blend-multiply blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-40 h-[30rem] w-[30rem] rounded-full bg-blue-500/5 bg-blend-multiply blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 bg-blend-multiply blur-[120px]" />

      {/* --- Header Section --- */}
      <div className="relative z-10 mx-auto mb-20 max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Take a Look Around
        </h1>
        <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
          Placeholder gallery — swap these tiles with real photos of the ATP
          Fitness floor, classes, and trainers via the gym's admin panel.
        </p>
      </div>

      {/* --- Glassmorphism Gallery Grid --- */}
      <div className="relative z-10 mx-auto grid max-w-7xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c, i) => (
          <div
            key={c.label}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-[2rem] transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl",
              // Outer glass frame
              "border border-white/20 bg-background/60 p-2.5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-black/40"
            )}
          >
            {/* Inner "Photo" Area */}
            <div
              className={`relative flex aspect-[4/3] w-full overflow-hidden rounded-[1.5rem] bg-gradient-to-br ${c.gradient}`}
            >
              {/* Subtle animated overlay pattern to make the gradient look like a placeholder image */}
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 mix-blend-overlay" />
              
              {/* Center decorative icon */}
              <div className="absolute inset-0 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                <ImageIcon className="h-16 w-16 text-white/20" strokeWidth={1} />
              </div>

              {/* Inner glass caption bar at the bottom */}
              <div className="absolute inset-x-2 bottom-2 flex items-center justify-between rounded-xl border border-white/20 bg-white/20 px-4 py-3 backdrop-blur-md transition-all duration-300 group-hover:bg-white/30 dark:bg-black/20 dark:group-hover:bg-black/30">
                <span className="text-sm font-semibold tracking-wide text-white drop-shadow-md">
                  {c.label}
                </span>
                <div className="rounded-full bg-black/20 p-2 backdrop-blur-sm">
                  <Camera className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}