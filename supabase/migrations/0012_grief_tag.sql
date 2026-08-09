-- 0012 — a circle can be about somebody who died.
--
-- The tag list has been nine pressures since 0003: money, leaving, work/AI,
-- comparing, family, alone, the road, heat, health. It is a good list and it
-- has no seat for the heaviest thing a person carries. Somebody three weeks
-- after their mother's burial opened the lobby, found nothing that said it,
-- and filed their grief under "Alone" or under "Health" — which is a product
-- telling them, in the only vocabulary it has, that there is no room for this.
--
-- `grief` is added to `circles.tag` and deliberately NOT to
-- `vents.real_world_tag`, which is a different list wearing the same nine
-- words. A real-world tag selects a coping tool at weight 95 — "one thing you
-- can do inside the danfo", "the one call you have been avoiding". There is no
-- such line for a burial, and writing one would be the same mistake this
-- release exists to fix. The private session already recognises bereavement
-- from the words themselves, in `nothingCanMove()`, and needs no tag for it.
--
-- The constraint is inline in 0003, so its name is Postgres-generated. Dropped
-- by that name and re-added explicitly, so 0013 does not have to guess.

alter table public.circles
  drop constraint if exists circles_tag_check;

alter table public.circles
  drop constraint if exists circles_tag_allowed;

alter table public.circles
  add constraint circles_tag_allowed check (tag in
    ('economy','japa','ai_job','social','family','lonely',
     'traffic','climate','health','grief'));
