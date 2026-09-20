import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export class PermissionError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "PermissionError";
  }
}

/** Throws if the current session's role can't perform `action` on `resource`. */
export async function requirePermission(resource: string, action: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    p_resource: resource,
    p_action: action,
  });
  if (error || !data) throw new PermissionError();
}

/** Throws unless the current user's role is one of `roles`. */
export async function requireRole(...roles: AppRole[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new PermissionError("Not authenticated.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !roles.includes(profile.role as AppRole)) {
    throw new PermissionError();
  }
  return profile;
}

/** Read-only permission check — like requirePermission but returns a boolean
 *  instead of throwing, for UI code that wants to conditionally render an
 *  action rather than let a user click into a guaranteed-to-fail attempt. */
export async function hasPermission(resource: string, action: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    p_resource: resource,
    p_action: action,
  });
  if (error) return false;
  return Boolean(data);
}

export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
}

/** Name of the gym the current user belongs to, for headers on generated documents (invoices, PDFs). */
export async function getCurrentGymName(): Promise<string> {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  if (!profile?.gym_id) return "ATP Fitness";

  const { data: gym } = await supabase.from("gyms").select("name").eq("id", profile.gym_id).single();
  return gym?.name ?? "ATP Fitness";
}