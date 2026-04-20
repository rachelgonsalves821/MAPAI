/**
 * Onboarding migration hook — no-op since Supabase is now the auth source of truth.
 * Onboarding status is read directly from user_profiles.is_onboarded in AuthContext.
 */

export function useOnboardingMigration() {
  // Nothing to migrate
}
