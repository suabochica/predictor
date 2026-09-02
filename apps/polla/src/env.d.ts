/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { User } from '@supabase/supabase-js';
import type { Locale } from '@predictor/i18n';

declare namespace App {
  interface Locals {
    user: User | null;
    displayName: string | null;
    isAdmin: boolean;
    leaderboardRank: number | null;
    totalPoints: number | null;
    lang: Locale;
  }
}
