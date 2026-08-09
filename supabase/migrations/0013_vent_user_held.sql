-- 0013 — the other half of the carve.
--
-- `vent_users.carve` (0011) holds the wound in eight words, written by a
-- model at the close of a session. This holds the opposite, written by the
-- person: the thing that held. Nobody's shoulders drop for a case note; they
-- drop for "my sister called and I didn't have to explain."
--
-- Gratitude is not a religious idea here, and the copy is careful never to
-- make it one. It is one of the most replicated findings in the literature
-- and it belongs to every tradition and to none — which is the requirement:
-- this has to work for a Muslim, a Christian, a traditionalist and somebody
-- who thinks all of it is nonsense, without any of them feeling addressed by
-- somebody else's language.
--
-- An array rather than one column, because a single note is a nice moment
-- and a handful is a record. Capped in code at five, not in a constraint:
-- the cap is a product decision that will change, and a migration is a bad
-- place to keep a number that moves.
--
-- jsonb rather than a table. Five short strings on the row that already
-- exists is not a relation — a `held` table would mean a join, an RLS
-- policy, a grant and a contract entry for something that is never queried
-- across people and never queried at all except by its owner.

alter table public.vent_users
  add column if not exists held jsonb not null default '[]'::jsonb
  check (jsonb_typeof(held) = 'array' and jsonb_array_length(held) <= 20);

comment on column public.vent_users.held is
  'What held, in the person''s own words. Array of {text, at}, newest first, '
  'capped in application code. Written only by the person, never by a model, '
  'and the only thing in this product safe to quote back to them: they wrote '
  'it while they were alright, for the version of them that is not.';
