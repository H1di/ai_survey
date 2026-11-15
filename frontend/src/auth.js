import { createClient } from "@supabase/supabase-js";

// Supabase Auth in the browser: anon key + the user's session only — the
// browser never talks to the tables (the backend does, see /api/me/paths).
// Without both build-time values auth is off and the app runs as before: the
// backend's bypass serves the fixed dev user (keyless rule).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { flowType: "pkce" } }) : null;
export const authEnabled = Boolean(supabase);

// What the top level renders: the app, the sign-in screen, or nothing while
// the stored session (or a magic-link / OAuth redirect) is still resolving.
export function authGate({ enabled, loading, session }) {
  if (!enabled) return "app";
  if (loading) return "loading";
  return session ? "app" : "signin";
}

// supabase-js refreshes an expiring token inside getSession().
export async function getAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

// Both flows come back to this page; supabase-js picks the code out of the
// URL on load (detectSessionInUrl) and fires SIGNED_IN.
const redirectTo = () => window.location.origin;

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo() },
  });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo() },
  });
  if (error) throw error;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut({ scope: "local" });
}
