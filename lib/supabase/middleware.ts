import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const PUBLIC_ROUTES = [
  "/", "/features", "/pricing", "/gallery", "/blog", "/testimonials",
  "/contact", "/about", "/login", "/register", "/register-gym",
  "/forgot-password", "/reset-password",
  "/api/invoices/download",
  "/api/cron",
  "/api/test-whatsapp",
  "/api/webhooks/",
];

const ROLE_HOME: Record<string, string> = {
  super_admin: "/dashboard/platform",
  gym_owner: "/dashboard/owner",
  receptionist: "/dashboard/reception",
  trainer: "/dashboard/trainer",
  member: "/dashboard/member",
};

const ROLE_ACCESS: Record<string, string[]> = {
  super_admin: ["platform", "owner", "reception", "trainer", "member"],
  gym_owner: ["owner"],
  receptionist: ["reception"],
  trainer: ["trainer"],
  member: ["member"],
};

function getSupabaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    new URL(raw);
    return raw;
  } catch {
    return null;
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_ROUTES.some((r) => path === r || (r !== "/" && path.startsWith(r)));

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[middleware] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing, empty, or invalid"
    );
    if (isPublic) return supabaseResponse;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // If Supabase is unreachable, treat the visitor as signed out instead of throwing.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.error("[middleware] supabase.auth.getUser() failed:", err);
  }

  if (!user && !isPublic) {
    const redirectTarget = path + request.nextUrl.search; // keep query string (e.g. invoice id/token)
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = ""; // drop any params from the original request (e.g. id/token) before adding our own
    url.searchParams.set("redirectTo", redirectTarget);
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/dashboard")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active, must_reset_password")
      .eq("id", user.id)
      .single();

    if (!profile || !profile.is_active) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "account_inactive");
      return NextResponse.redirect(url);
    }

    if (profile.must_reset_password && path !== "/dashboard/reset-password") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard/reset-password";
      return NextResponse.redirect(url);
    }

    const segment = path.split("/")[2]; // /dashboard/<segment>/...
    const allowed = ROLE_ACCESS[profile.role] ?? [];

    // Bare "/dashboard" has no page of its own -- send the user to their role's home.
    if (!segment) {
      const url = request.nextUrl.clone();
      url.pathname = ROLE_HOME[profile.role] ?? "/login";
      return NextResponse.redirect(url);
    }

    // reset-password is a universal dashboard page every role can reach
    // (it's how must_reset_password is satisfied above) -- it isn't a
    // role-prefixed segment, so it must be excluded from the role-segment
    // allowlist check below or a user who must reset their password gets
    // bounced here, fails the allowlist, gets sent home, and is bounced
    // right back -- an infinite redirect loop.
    if (segment !== "reset-password" && !allowed.includes(segment)) {
      const url = request.nextUrl.clone();
      url.pathname = ROLE_HOME[profile.role] ?? "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  if (user && (path === "/login" || path === "/register")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const url = request.nextUrl.clone();
    url.pathname = profile ? ROLE_HOME[profile.role] ?? "/dashboard" : "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}