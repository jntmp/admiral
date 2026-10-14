-- Speed rounds: their own table, submit function and board, kept apart from
-- classic and daily scores while the mode is new. Nothing about the existing
-- scores table or its functions changes.
--
-- A speed round doesn't wait for the ball to come down before the next
-- throw, so it can take far more shots than a classic round: the limits
-- below are twice the classic ones. The board is all time, one entry per
-- player at their best, and a round goes on it only if it beats that
-- player's speed best.

create table public.speed_scores (
  id bigint generated always as identity primary key,
  round_id uuid not null unique,
  initials text not null check (initials ~ '^[A-Z]{3}$'),
  score integer not null check (score between 0 and 960),
  made integer not null check (made between 0 and 120),
  attempts integer not null check (attempts between made and 120),
  best_streak integer not null check (best_streak between 0 and made),
  created_at timestamptz not null default now(),
  -- The most one make can be worth: a swished three (4) doubled on fire.
  constraint speed_score_fits_makes check (score <= made * 8)
);

create index speed_scores_player_idx on public.speed_scores (initials, score desc);

alter table public.speed_scores enable row level security;

create policy "Speed leaderboard is public"
  on public.speed_scores for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.speed_scores from anon, authenticated;

-- Saves a speed round and returns where it placed among speed players. Same
-- rules as submit_score: a retried round returns its stored result, only a
-- new best for those initials is kept (409 otherwise), and each client gets
-- 5 saves a minute, shared with classic and daily saves.
create function public.submit_speed(
  p_round uuid,
  p_initials text,
  p_score integer,
  p_made integer,
  p_attempts integer,
  p_best_streak integer
)
returns table (rank_speed bigint, players bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_ip text := coalesce(
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '')
  );
  v_initials text := upper(p_initials);
  v_client text;
  v_score integer;
  v_best integer;
begin
  if p_round is null then
    raise exception 'Missing round id' using errcode = '22004';
  end if;

  select s.score into v_score from public.speed_scores s where s.round_id = p_round;

  if v_score is null then
    select max(s.score) into v_best from public.speed_scores s where s.initials = v_initials;
    if p_score <= v_best then
      raise exception '% already has % in speed mode. Only a higher score goes on the board.', v_initials, v_best
        using errcode = 'PT409';
    end if;

    -- Without a client address there is nothing fair to throttle on.
    if v_ip is not null then
      v_client := encode(sha256(convert_to((select s.salt from private.secrets s limit 1) || v_ip, 'UTF8')), 'hex');
      delete from private.submissions where at < now() - interval '1 hour';
      if (select count(*) from private.submissions s
          where s.client = v_client and s.at > now() - interval '1 minute') >= 5 then
        raise exception 'Too many scores from you in the last minute. Try again shortly.'
          using errcode = 'P0001';
      end if;
      insert into private.submissions (client) values (v_client);
    end if;

    insert into public.speed_scores (round_id, initials, score, made, attempts, best_streak)
    values (p_round, v_initials, p_score, p_made, p_attempts, p_best_streak);
    v_score := p_score;
  end if;

  return query select
    (select count(distinct s.initials) + 1 from public.speed_scores s
      where s.initials <> v_initials and s.score > v_score),
    (select count(distinct s.initials) from public.speed_scores s);
end;
$$;

revoke all on function public.submit_speed(uuid, text, integer, integer, integer, integer) from public;
grant execute on function public.submit_speed(uuid, text, integer, integer, integer, integer) to anon, authenticated;

-- The speed board, best first, each player once at their best; ties go to
-- whoever set the score first.
create function public.top_speed(p_limit integer default 10)
returns table (initials text, score integer, made integer, attempts integer, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select b.initials, b.score, b.made, b.attempts, b.created_at
  from (
    select distinct on (s.initials) s.initials, s.score, s.made, s.attempts, s.created_at
    from public.speed_scores s
    order by s.initials, s.score desc, s.created_at
  ) b
  order by b.score desc, b.created_at
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke all on function public.top_speed(integer) from public;
grant execute on function public.top_speed(integer) to anon, authenticated;
