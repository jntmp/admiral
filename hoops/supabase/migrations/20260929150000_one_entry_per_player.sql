-- One entry per player on each board. Initials are the only identity the
-- game has, so they stand for the player.
--
-- A round is stored only if it beats that player's best on its board: the
-- same day's daily, or classic rounds from the last 7 days. Measuring classic
-- rounds against the week rather than all time lets a returning player back
-- onto the weekly board with a score below their all-time best. Boards are
-- read through top_scores(), which shows each player once, at their best;
-- rows stored before this change are kept.

create index scores_player_idx on public.scores (initials, challenge, score desc);

-- As before, plus the new-best check. It comes after the retry lookup, so a
-- retried save of a round that did go in still succeeds. PT409 makes the API
-- answer 409 Conflict with this message.
create or replace function private.save_round(
  p_round uuid,
  p_challenge date,
  p_initials text,
  p_score integer,
  p_made integer,
  p_attempts integer,
  p_best_streak integer
)
returns integer
language plpgsql
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

  select s.score into v_score from public.scores s where s.round_id = p_round;
  if v_score is not null then
    return v_score;
  end if;

  select max(s.score) into v_best
  from public.scores s
  where s.initials = v_initials
    and case
      when p_challenge is null then s.challenge is null and s.created_at > now() - interval '7 days'
      else s.challenge = p_challenge
    end;
  if p_score <= v_best then
    raise exception '% already has % %. Only a higher score goes on the board.',
      v_initials, v_best, case when p_challenge is null then 'this week' else 'on this daily' end
      using errcode = 'PT409';
  end if;

  -- Without a client address there is nothing fair to throttle on, so skip
  -- it rather than lumping every player into one bucket.
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

  insert into public.scores (round_id, challenge, initials, score, made, attempts, best_streak)
  values (p_round, p_challenge, v_initials, p_score, p_made, p_attempts, p_best_streak);
  return p_score;
end;
$$;

-- Classic rounds. Ranks count players, not rows. A new weekly best can still
-- be below the player's all-time best, so the all-time rank is for that best
-- (returned as best_all). Same arguments as before, and still returns
-- rank_all and rank_week, so cached copies of the game keep working.
drop function public.submit_score(uuid, text, integer, integer, integer, integer);

create function public.submit_score(
  p_round uuid,
  p_initials text,
  p_score integer,
  p_made integer,
  p_attempts integer,
  p_best_streak integer
)
returns table (rank_all bigint, rank_week bigint, best_all integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_initials text := upper(p_initials);
  v_score integer := private.save_round(p_round, null, p_initials, p_score, p_made, p_attempts, p_best_streak);
  v_best integer;
begin
  select max(s.score) into v_best from public.scores s
  where s.challenge is null and s.initials = v_initials;

  return query select
    (select count(distinct s.initials) + 1 from public.scores s
      where s.challenge is null and s.initials <> v_initials and s.score > v_best),
    (select count(distinct s.initials) + 1 from public.scores s
      where s.challenge is null and s.initials <> v_initials and s.score > v_score
        and s.created_at > now() - interval '7 days'),
    v_best;
end;
$$;

revoke all on function public.submit_score(uuid, text, integer, integer, integer, integer) from public;
grant execute on function public.submit_score(uuid, text, integer, integer, integer, integer) to anon, authenticated;

-- Daily rounds: unchanged, except that ranks and the player count are by player.
create or replace function public.submit_daily(
  p_round uuid,
  p_day date,
  p_initials text,
  p_score integer,
  p_made integer,
  p_attempts integer,
  p_best_streak integer
)
returns table (rank_day bigint, players bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamp := now() at time zone 'utc';
  v_initials text := upper(p_initials);
  v_score integer;
begin
  if p_day is null or not (
    p_day = v_now::date
    or (p_day = v_now::date - 1 and v_now < v_now::date + interval '10 minutes')
  ) then
    raise exception 'That daily challenge is closed.' using errcode = 'P0001';
  end if;

  v_score := private.save_round(p_round, p_day, p_initials, p_score, p_made, p_attempts, p_best_streak);

  return query select
    (select count(distinct s.initials) + 1 from public.scores s
      where s.challenge = p_day and s.initials <> v_initials and s.score > v_score),
    (select count(distinct s.initials) from public.scores s where s.challenge = p_day);
end;
$$;

-- A board, best first, each player once at their best; ties go to whoever
-- set the score first. 'daily' is p_day's challenge; 'week' (the last 7 days)
-- and 'all' are classic rounds.
create function public.top_scores(p_board text, p_day date default null, p_limit integer default 10)
returns table (initials text, score integer, made integer, attempts integer, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select b.initials, b.score, b.made, b.attempts, b.created_at
  from (
    select distinct on (s.initials) s.initials, s.score, s.made, s.attempts, s.created_at
    from public.scores s
    where case p_board
      when 'daily' then s.challenge = p_day
      when 'week' then s.challenge is null and s.created_at > now() - interval '7 days'
      else s.challenge is null
    end
    order by s.initials, s.score desc, s.created_at
  ) b
  order by b.score desc, b.created_at
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke all on function public.top_scores(text, date, integer) from public;
grant execute on function public.top_scores(text, date, integer) to anon, authenticated;
