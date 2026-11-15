const { createClient } = require("@supabase/supabase-js");

// Server-side Supabase access with the service-role key (bypasses RLS — RLS
// guards the tables against the anon/authenticated keys, see
// supabase/migrations). Optional like every other external service: without
// both env values every method is a no-op and the app runs as before.
//
// One saved_paths row per live session, upserted on accept and again when the
// roadmap lands, so a double-accept or a roadmap retry can never add a row.
function createSupabaseDb({ url, serviceRoleKey } = {}) {
  if (!url || !serviceRoleKey) {
    return {
      enabled: false,
      async saveAcceptedPath() {},
      async listSavedPaths() {
        return [];
      },
    };
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return {
    enabled: true,
    async saveAcceptedPath({ userId, session, output, roadmap = null }) {
      const { error } = await client.from("saved_paths").upsert(
        {
          user_id: userId,
          session_id: session.id,
          output_id: output.id,
          title: output.jobTitle || null,
          soc_code: output.socCode || null,
          output,
          roadmap,
        },
        { onConflict: "session_id" }
      );
      if (error) throw new Error(`saved_paths upsert failed: ${error.message}`);
    },
    async listSavedPaths(userId) {
      const { data, error } = await client
        .from("saved_paths")
        .select("id, session_id, output_id, title, soc_code, output, roadmap, accepted_at")
        .eq("user_id", userId)
        .order("accepted_at", { ascending: false });
      if (error) throw new Error(`saved_paths select failed: ${error.message}`);
      return data;
    },
  };
}

module.exports = { createSupabaseDb };
