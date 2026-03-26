/**
 * Extend Clerk's publicMetadata type to include Mapai-specific fields.
 */
interface ClerkPublicMetadata {
  onboardingCompleted?: boolean;
  onboardingCompletedAt?: string;
}

declare global {
  interface UserPublicMetadata extends ClerkPublicMetadata {}
}

export {};
