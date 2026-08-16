-- 0015 — the Breaking Room's answers.
--
-- Third column on the same row, and the trio is deliberate:
--
--   carve     (0011)  the wound, in eight words, written by a model
--   held      (0013)  what carried them, written by them, on a good day
--   breaking  (0015)  what they answered when asked something heavy
--
-- All three live on `vent_users`, so one delete takes all of them and no
-- deletion path has to remember a fourth table exists. That is not tidiness:
-- `/history → Delete everything` is a promise this product makes on its front
-- page, and every row that lives somewhere else is a way to break it quietly.
--
-- This is the most sensitive text in the product. `held` is what somebody
-- wrote while they were alright; this is what they said when the room asked
-- who they are pretending to be. It is stored for one reason — the room can
-- hand it back later, and a question answered into a void is a question that
-- was never worth asking — and it is stored under exactly the same terms as
-- everything else here: anonymous id, no name, no email, gone on request.
--
-- jsonb rather than a table, for the same reason as `held`: a handful of
-- short entries never queried across people is not a relation. Capped in
-- application code, because a cap is a product decision that moves.

alter table public.vent_users
  add column if not exists breaking jsonb not null default '[]'::jsonb
  check (jsonb_typeof(breaking) = 'array' and jsonb_array_length(breaking) <= 60);

comment on column public.vent_users.breaking is
  'Breaking Room answers. Array of {q, a, at} newest first — question id, their '
  'own words, when. Never written by a model. Crisis-checked on write like held: '
  'a heavy question can be answered with the worst sentence of somebody''s life, '
  'and that routes to a human rather than being filed as an answer.';
