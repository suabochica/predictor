#!/usr/bin/env node

/**
 * Trigger score calculation for all finished matches.
 *
 * Calls the polla_score_all_finished_matches() RPC to recalculate points_earned
 * for every match whose actual_score_a / actual_score_b are set.
 *
 * Designed to run as a cron job at 23:30 Colombian Time (UTC-5 → 04:30 UTC):
 *   30 4 * * *  node apps/polla/scripts/score-matches.mjs
 *
 * Also callable manually:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx pnpm score-matches
 *
 * The service-role key is required because the RPC is SECURITY DEFINER
 * (it writes to predictions across all users, bypassing RLS).
 *
 * If pg_cron is available on your Supabase project, prefer the database-level
 * schedule in migration 041 instead of (or in addition to) this script.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {
    // .env not found, that's ok
  }
}
loadEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("ERROR: SUPABASE_URL or PUBLIC_SUPABASE_URL not set.");
  process.exit(1);
}
if (!supabaseKey) {
  console.error(
    "ERROR: SUPABASE_SERVICE_ROLE_KEY is required (RPC writes predictions across all users).",
  );
  console.error(
    "Find it in Supabase Dashboard → Project Settings → API → service_role key.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log(
    `[${new Date().toISOString()}] Running polla_score_all_finished_matches()…`,
  );

  const { data, error } = await supabase.rpc(
    "polla_score_all_finished_matches",
  );

  if (error) {
    console.error(
      "ERROR calling polla_score_all_finished_matches:",
      error.message,
    );
    process.exit(1);
  }

  const count = Array.isArray(data) ? data.length : 0;
  console.log(
    `[${new Date().toISOString()}] Done — scored ${count} match(es).`,
  );
  if (count > 0) {
    console.log(
      "Match IDs:",
      data.map((m) => (typeof m === "string" ? m : m.id || m)).join(", "),
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
