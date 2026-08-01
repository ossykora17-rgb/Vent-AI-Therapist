-- =============================================================================
-- A member's own opening pressure.
--
-- The closing drop has to be measured from the chair *that person* picked. A
-- circle-wide number would show a joiner someone else's starting point, which
-- is worse than showing nothing. Re-runnable.
-- =============================================================================

alter table public.circle_members
  add column if not exists pressure_seeded int
    check (pressure_seeded between 0 and 100);
