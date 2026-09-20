import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/utils/permissions";
import { DashboardShell } from "@/components/features/dashboard/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className="relative min-h-screen selection:bg-primary/20 selection:text-primary">
      {/* 
        Global Glassmorphic Ambient Background Lighting:
        Projects a subtle, frosted light diffusion across the dashboard canvas 
        behind all nested client, renewal, and trainer views.
      */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/3 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute top-1/2 -right-32 h-[400px] w-[400px] rounded-full bg-primary/5 blur-[100px]" />
      </div>

      {/* Main Shell & Dynamic Page Container with Fade-In Animation */}
      <DashboardShell 
        role={profile.role} 
        fullName={profile.full_name} 
        avatarUrl={profile.avatar_url}
      >
        <div className="animate-in fade-in-50 duration-500">
          {children}
        </div>
      </DashboardShell>
    </div>
  );
}