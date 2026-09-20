import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        
        {/* Changed 'max-w-sm' to 'sm:w-[350px]' to tightly hug the standard form width */}
        <div className="mx-auto w-full sm:w-[350px]">
          <Link href="/" className="mb-8 flex items-center">
            <Image
              src="/logo.png"
              alt="ATP Fitness"
              width={1350}
              height={901}
              priority
              className="h-12 w-auto"
            />
          </Link>
          
          {children}
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-accent to-[#1A1006] lg:flex lg:flex-col lg:justify-between lg:p-16">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="relative z-10">
          <p className="text-sm font-medium text-white/70">Members, trainers, and staff — one portal</p>
        </div>
        <blockquote className="relative z-10 space-y-4">
          <p className="text-2xl font-medium leading-snug text-white">
            "Your workouts, diet plan, and attendance — all in the ATP Fitness app.
            No more asking the front desk how many sessions you've got left."
          </p>
          <footer className="text-sm text-white/70">ATP Fitness — Anantapur</footer>
        </blockquote>
      </div>
    </div>
  );
}