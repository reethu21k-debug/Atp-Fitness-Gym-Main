import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const PUBLIC_ROUTES = [
  "/", "/features", "/pricing", "/gallery", "/blog", "/testimonials",
  "/contact", "/about", "/login", "/register", "/register-gym",
  "/forgot-password", "/reset-password",
  // Self-authenticating via their own secret header/HMAC -- must stay
  // reachable without a browser session (pg_cron / email links have none).
  // NOTE: "/api/cron" covers every scheduled job, including
  // marketing-automation, which was previously missing from this list -- so
  // middleware redirected it to /login and the job silently never ran.
  "/api/invoices/download",
  "/api/cron",
  // CRON_SECRET-authenticated diagnostic endpoint. It used to be skipped by
  // the middleware matcher entirely, which left it publicly reachable.
  "/api/test-whatsapp",
  // Meta delivery-status callbacks, verified by X-Hub-Signature-256 HMAC.
  "/api/webhooks/",
];

const ROLE_HOME: Record<string, string> = {
  super_admin: "/dashboard/platform",
  gym_owner: "/dashboard/owner",
  receptionist: "/dashboard/reception",
  trainer: "/dashboard/trainer",
  member: "/dashboard/member",
};

// Which role-prefixed dashboard segments each role is allowed into.
const ROLE_ACCESS: Record<string, string[]> = {
  super_admin: ["platform", "owner", "reception", "trainer", "member"],
  gym_owner: ["owner"],
  receptionist: ["reception"],
  trainer: ["trainer"],
  member: ["member"],
};

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_ROUTES.some((r) => path === r || (r !== "/" && path.startsWith(r)));

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
