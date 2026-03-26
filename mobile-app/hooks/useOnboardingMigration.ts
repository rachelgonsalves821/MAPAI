/**
 * One-time migration: syncs onboarding status from Supabase to Clerk
 * publicMetadata for users who completed onboarding before the Clerk
 * metadata field existed.
 *
 * Runs once per app load. If Clerk already has the flag, exits
 * immediately with no DB call. Non-blocking.
 */

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/services/supabase';

export function useOnboardingMigration() {
  const { clerkUser } = useAuth();

  useEffect(() => {
    if (!clerkUser) return;
    if (clerkUser.publicMetadata?.onboardingCompleted === true) return;
    if (!supabase) return;

    (async () => {
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('is_onboarded')
          .eq('clerk_user_id', clerkUser.id)
          .maybeSingle();

        if (data?.is_onboarded === true) {
          await clerkUser.update({
            publicMetadata: {
              ...clerkUser.publicMetadata,
              onboardingCompleted: true,
              onboardingCompletedAt: 'migrated-from-supabase',
            },
          });
          console.log('[Migration] Synced onboarding flag to Clerk for', clerkUser.id);
        }
      } catch (err) {
        console.warn('[Migration] Onboarding sync failed (will retry):', err);
      }
    })();
  }, [clerkUser?.id]);
}
