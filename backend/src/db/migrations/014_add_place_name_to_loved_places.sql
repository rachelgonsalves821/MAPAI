-- ============================================================
-- Migration 014: Add place_name column to user_loved_places
--                and backfill from places + recent_places_viewed
-- ============================================================

DO $$
BEGIN

  -- 1. Add column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_loved_places'
      AND column_name  = 'place_name'
  ) THEN
    ALTER TABLE public.user_loved_places ADD COLUMN place_name TEXT;
    RAISE NOTICE 'Added place_name column to user_loved_places';
  END IF;

END $$;

-- 2. Backfill from places table (primary source)
UPDATE public.user_loved_places ulp
SET place_name = p.name
FROM public.places p
WHERE ulp.place_id = p.google_place_id
  AND (ulp.place_name IS NULL OR ulp.place_name = '');

-- 3. Fallback: backfill from recent_places_viewed
UPDATE public.user_loved_places ulp
SET place_name = rpv.place_name
FROM public.recent_places_viewed rpv
WHERE ulp.place_id = rpv.place_id
  AND ulp.user_id  = rpv.user_id
  AND (ulp.place_name IS NULL OR ulp.place_name = '')
  AND rpv.place_name IS NOT NULL;
