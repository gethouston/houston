-- Harden public.profiles against email exposure to the anonymous web role.
--
-- Problem: `anon` holds a blanket table-level SELECT on public.profiles, and
-- the "read public profile by handle" RLS policy (USING handle IS NOT NULL)
-- makes any handled profile row visible to everyone. RLS gates ROWS, not
-- COLUMNS, so the moment a profile sets a handle, its `email` (and other
-- non-public fields) become readable by anyone holding the public anon key.
-- Today 0 of ~900 profiles have a handle, so nothing is exposed yet; this is a
-- latent leak that opens the day public handles ship.
--
-- Fix: replace anon's blanket SELECT with a column-scoped SELECT limited to
-- public-safe display fields. Row visibility (own profile / public-by-handle)
-- is unchanged; anon simply can no longer read email, last_seen_at, or socials.
-- `authenticated` keeps full SELECT, so a signed-in user still reads their own
-- email via the "read own profile" policy. service_role is untouched.

revoke select on public.profiles from anon;

grant select (
  user_id,
  handle,
  name,
  avatar_url,
  cover_url,
  bio,
  created_at
) on public.profiles to anon;

-- Verify after applying:
--   select has_column_privilege('anon','public.profiles','email','SELECT')  as anon_email;   -- expect false
--   select has_column_privilege('anon','public.profiles','handle','SELECT') as anon_handle;  -- expect true
--   select has_column_privilege('authenticated','public.profiles','email','SELECT') as auth_email; -- expect true
