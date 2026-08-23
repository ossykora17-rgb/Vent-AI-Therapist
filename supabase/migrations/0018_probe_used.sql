-- 0018 — which extraction question was asked, mirroring tactic_used.
--
-- `probes.ts` holds fifty questions and selects one per turn against the
-- person's own words, with a three-turn block so the same good question is not
-- asked every Tuesday. The block needs to know what was already asked, and
-- there was nowhere to read it from: `tactic_used` has carried exactly this for
-- the *move* since 0002, and nothing carried it for the question.
--
-- Without this column `selectProbe` blocks against an empty list, so the
-- highest-ranked question for a given message shape is asked every single time
-- that shape recurs — a library of fifty shipping as a library of one, which is
-- the same failure as a template and harder to see.
--
-- Nullable, no default, no backfill. Every row written before this migration
-- genuinely had no probe, and a default would invent one for sittings that
-- already happened.

alter table public.vents add column if not exists probe_used text;

notify pgrst, 'reload schema';
