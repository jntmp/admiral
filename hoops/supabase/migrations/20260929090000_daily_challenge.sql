-- Daily challenge scores. A daily round is stored with the UTC date of its
-- challenge; classic rounds leave it empty. Classic and daily rounds are
-- ranked separately, since each day's twist changes how scoring works.

alter table public.scores add column challenge date;
create index scores_challenge_rank_idx on public.scores (challenge, score desc, created_at);

-- Shared by both submit functions: skip a round already stored (so retries
-- are safe), throttle the client, then store the round. Returns the score on
-- file for the round.
create function private.save_round(
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
  v_client text;
  v_score integer;
begin
  if p_round is null then
    raise exception 'Missing round id' using errcode = '22004';
  end if;

  select s.score into v_score from public.scores s where s.round_id = p_round;
  if v_score is not null then
    return v_score;
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
  values (p_round, p_challenge, upper(p_initials), p_score, p_made, p_attempts, p_best_streak);
  return p_score;
end;
$$;

revoke all on function private.save_round(uuid, date, text, integer, integer, integer, integer) from public;

-- Classic rounds: same arguments as before, now ranked among classic rounds only.
create or replace function public.submit_score(
  p_round uuid,
  p_initials text,
  p_score integer,
  p_made integer,
  p_attempts integer,
  p_best_streak integer
)
returns table (rank_all bigint, rank_week bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_score integer := private.save_round(p_round, null, p_initials, p_score, p_made, p_attempts, p_best_streak);
begin
  return query select
    (select count(*) + 1 from public.scores s where s.challenge is null and s.score > v_score),
    (select count(*) + 1 from public.scores s
      where s.challenge is null and s.score > v_score and s.created_at > now() - interval '7 days');
end;
$$;

-- Daily rounds: only today's challenge (UTC) is open, plus the first ten
-- minutes of the next day for a round that started before midnight.
create function public.submit_daily(
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
    (select count(*) + 1 from public.scores s where s.challenge = p_day and s.score > v_score),
    (select count(*) from public.scores s where s.challenge = p_day);
end;
$$;

revoke all on function public.submit_daily(uuid, date, text, integer, integer, integer, integer) from public;
grant execute on function public.submit_daily(uuid, date, text, integer, integer, integer, integer) to anon, authenticated;
