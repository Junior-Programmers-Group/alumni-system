begin;

-- Preserve row-level profile policies but prevent client access to email,
-- suspension details, lock state, account source, and moderation counters.
revoke select on table public.profiles from public, anon, authenticated;
revoke select (email, locked_until, suspension_reason, deactivated_at,
  suspension_expires_at, account_source, last_active_at, warnings_count)
on table public.profiles from public, anon, authenticated;
grant select (id, first_name, last_name, role, status, avatar_url, cover_url, created_at)
on table public.profiles to authenticated;

commit;
