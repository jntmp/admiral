-- Make saving a score safe to retry. Each round carries a random id from the
-- game; sending the same round again returns its ranks instead of adding a
-- second row, so the client can retry after a dropped connection.

alter table public.scores add column round_id uuid unique;

drop function public.submit_score(text, integer, integer, integer, integer);

create function public.submit_score(
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

  if v_score is null then
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

    insert into public.scores (round_id, initials, score, made, attempts, best_streak)
    values (p_round, upper(p_initials), p_score, p_made, p_attempts, p_best_streak);
    v_score := p_score;
  end if;

  return query select
    (select count(*) + 1 from public.scores s where s.score > v_score),
    (select count(*) + 1 from public.scores s
      where s.score > v_score and s.created_at > now() - interval '7 days');
end;
$$;

revoke all on function public.submit_score(uuid, text, integer, integer, integer, integer) from public;
grant execute on function public.submit_score(uuid, text, integer, integer, integer, integer) to anon, authenticated;
