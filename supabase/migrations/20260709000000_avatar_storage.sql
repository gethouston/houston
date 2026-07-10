-- Avatar uploads: a public-read "avatars" storage bucket plus the RLS that lets
-- each signed-in user manage ONLY the files under their own uid folder, and the
-- column-scoped grant that lets them write their own profiles.avatar_url.
--
-- Upload path convention (see app/src/lib/profile-avatar.ts):
--   avatars/<uid>/avatar.<ext>
-- so the first path segment is always the owner's uid. RLS keys off that.
--
-- NOT APPLIED by the code that ships this file. Deploy runs the migration
-- against Supabase (supabase db push / the hosted migration step). Until then
-- the upload flow surfaces the storage error verbatim to the user.
--
-- Idempotent throughout (re-runnable): bucket upsert, drop-if-exists before
-- each policy, and grants are naturally idempotent — matching the local
-- migration conventions (20260622 waitlist, 20260628 anon column scope).

-- 1. Bucket: public read, with SERVER-enforced size and MIME limits. `public =
--    true` makes objects downloadable via the public object endpoint without a
--    per-request token; writes still go through the RLS policies below. RLS gates
--    only the FOLDER, never size or content-type — those are bucket columns, so
--    set them here. Without them the 5 MB / image-only checks in
--    `profile-avatar-core.ts` are client-only and bypassable by a direct Storage
--    API call, letting a user store an arbitrary-size file or an attacker-chosen
--    content-type (e.g. text/html, image/svg+xml) under their own uid folder,
--    served from the public bucket. The size mirrors MAX_AVATAR_BYTES; the MIME
--    set is what the client ever uploads (webp/jpeg after re-encode) plus the
--    common image types it accepts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB, mirrors MAX_AVATAR_BYTES in profile-avatar-core.ts
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. Storage RLS on storage.objects (RLS is already enabled on it by Supabase).
--    Read is open (public bucket); insert/update/delete are constrained to the
--    caller's own uid folder — (storage.foldername(name))[1] is the first path
--    segment, which our upload path pins to the uid.

drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars: insert own folder" on storage.objects;
create policy "avatars: insert own folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: update own folder" on storage.objects;
create policy "avatars: update own folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: delete own folder" on storage.objects;
create policy "avatars: delete own folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. profiles.avatar_url write access. Row scoping (own row only) is already
--    enforced by the "update own profile" RLS policy from 20260424. Supabase
--    default-grants a BLANKET table-level UPDATE to `authenticated` (the same
--    default the 20260628 anon revoke proves), so a bare column grant would be
--    additive and a no-op — authenticated would still be able to write
--    name/handle/bio/cover_url on its own row. Revoke the blanket UPDATE first,
--    THEN re-grant a COLUMN-scoped UPDATE on avatar_url only: now the grant is
--    load-bearing and authenticated can write avatar_url and nothing wider. Safe
--    because the client only ever updates avatar_url (app/src/lib/profile-avatar.ts);
--    name/avatar are seeded server-side by the handle_new_user trigger, with no
--    client write to the other columns. Both statements are idempotent.
revoke update on public.profiles from authenticated;
grant update (avatar_url) on public.profiles to authenticated;

-- Verify after applying:
--   select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars';  -- expect true, 5242880, {image/*}
--   select has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE') as can_write_avatar; -- expect true
--   select has_column_privilege('authenticated','public.profiles','name','UPDATE') as can_write_name; -- expect false
