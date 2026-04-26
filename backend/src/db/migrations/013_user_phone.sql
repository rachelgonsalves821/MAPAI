-- ═══════════════════════════════════════════════════════════════════════════
-- Mapai Migration 009 — Add phone column to user_profiles
--
-- Enables phone-based contact matching in POST /v1/friends/match-contacts.
-- Phone numbers are stored in E.164 format (e.g. +16175551234).
--
-- Run order: after 003_user_profiles.sql
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Index for contact-sync lookups (IN-list queries)
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone
  ON public.user_profiles (phone)
  WHERE phone IS NOT NULL;
