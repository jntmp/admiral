-- Pixel Hoops leaderboard.
--
-- Anyone can read scores. Writes only go through submit_score(), which
-- validates the numbers and throttles each client, because the game runs in
-- the browser and its reported score can't be trusted outright.

create table public.scores (
  id bigint generated always as identity primary key,
  initials text not null check (initials ~ '^[A-Z0-9]{3}$'),
  score integer not null check (score between 0 and 480),
  made integer not null check (made between 0 and 60),
  attempts integer not null check (attempts between made and 60),
  best_streak integer not null check (best_streak between 0 and made),
  created_at timestamptz not null default now(),
  -- The most one make can be worth: a swished three (4) doubled on fire.
  constraint score_fits_makes check (score <= made * 8)
);

create index scores_rank_idx on public.scores (score desc, created_at);
create index scores_created_idx on public.scores (created_at);

alter table public.scores enable row level security;

create policy "Leaderboard is public"
  on public.scores for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.scores from anon, authenticated;

-- Throttle bookkeeping lives outside the API-exposed schema. Clients are
-- stored as salted hashes and kept for an hour at most.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.secrets (salt text not null);
insert into private.secrets (salt) values (gen_random_uuid()::text);

create table private.submissions (
  client text not null,
  at timestamptz not null default now()
);
create index submissions_client_at_idx on private.submissions (client, at);

alter table private.secrets enable row level security;
alter table private.submissions enable row level security;

create function public.submit_score(
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
  v_headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_ip text := coalesce(
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '')
  );
  v_client text;
begin
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

  insert into public.scores (initials, score, made, attempts, best_streak)
  values (upper(p_initials), p_score, p_made, p_attempts, p_best_streak);

  return query select
    (select count(*) + 1 from public.scores s where s.score > p_score),
    (select count(*) + 1 from public.scores s
      where s.score > p_score and s.created_at > now() - interval '7 days');
end;
$$;

revoke all on function public.submit_score(text, integer, integer, integer, integer) from public;
grant execute on function public.submit_score(text, integer, integer, integer, integer) to anon, authenticated;
