-- Durable rate limits for the paid AI endpoints (/api/convert-monster,
-- /api/render-child-character) and the drawing upload that gates them.
--
-- Each bucket is a fixed-window counter keyed by an opaque string such as
-- "monster:ip-hour:<hmac>" or "ai:global-day:2026-10-08". IPs are stored only
-- as keyed hashes. The API calls consume_ai_rate_limits() once per request; it
-- checks every bucket and increments them together, so a blocked request never
-- consumes quota from the other buckets.

create table if not exists public.ai_rate_limits (
  bucket text primary key check (char_length(bucket) between 1 and 200),
  hits integer not null default 0 check (hits >= 0),
  window_started_at timestamptz not null default now(),
  window_seconds integer not null check (window_seconds between 1 and 2678400),
  updated_at timestamptz not null default now()
);

create index if not exists ai_rate_limits_updated_idx on public.ai_rate_limits (updated_at);

alter table public.ai_rate_limits enable row level security;
revoke all on table public.ai_rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.ai_rate_limits to service_role;

-- p_buckets: [{"bucket": text, "limit": int, "window_seconds": int}, ...]
-- Returns {"allowed": bool, "bucket": text|null, "hits": int|null,
--          "limit": int|null, "retry_after_seconds": int}
create or replace function public.consume_ai_rate_limits(p_buckets jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  v_bucket text;
  v_limit integer;
  v_window integer;
  v_row public.ai_rate_limits%rowtype;
  v_hits integer;
  v_now timestamptz := clock_timestamp();
  v_blocked text := null;
  v_blocked_hits integer := null;
  v_blocked_limit integer := null;
  v_retry integer := 0;
begin
  if jsonb_typeof(p_buckets) <> 'array' or jsonb_array_length(p_buckets) = 0 or jsonb_array_length(p_buckets) > 10 then
    raise exception 'p_buckets must be an array of 1-10 buckets' using errcode = '22023';
  end if;

  -- Lock buckets in a stable order so concurrent requests cannot deadlock.
  for item in select value from jsonb_array_elements(p_buckets) order by value->>'bucket' loop
    v_bucket := item->>'bucket';
    v_limit := (item->>'limit')::integer;
    v_window := (item->>'window_seconds')::integer;
    if v_bucket is null or v_limit is null or v_limit < 1 or v_window is null or v_window < 1 then
      raise exception 'invalid rate limit bucket' using errcode = '22023';
    end if;

    insert into public.ai_rate_limits (bucket, hits, window_started_at, window_seconds, updated_at)
      values (v_bucket, 0, v_now, v_window, v_now)
      on conflict (bucket) do nothing;
    select * into v_row from public.ai_rate_limits where bucket = v_bucket for update;

    v_hits := case
      when v_row.window_started_at + make_interval(secs => v_row.window_seconds) <= v_now then 0
      else v_row.hits
    end;
    if v_hits >= v_limit then
      v_retry := greatest(v_retry, ceil(extract(epoch from (v_row.window_started_at + make_interval(secs => v_row.window_seconds) - v_now)))::integer);
      if v_blocked is null then
        v_blocked := v_bucket;
        v_blocked_hits := v_hits;
        v_blocked_limit := v_limit;
      end if;
    end if;
  end loop;

  if v_blocked is not null then
    return jsonb_build_object('allowed', false, 'bucket', v_blocked, 'hits', v_blocked_hits, 'limit', v_blocked_limit, 'retry_after_seconds', greatest(v_retry, 1));
  end if;

  for item in select value from jsonb_array_elements(p_buckets) loop
    update public.ai_rate_limits
      set hits = case when window_started_at + make_interval(secs => window_seconds) <= v_now then 1 else hits + 1 end,
          window_started_at = case when window_started_at + make_interval(secs => window_seconds) <= v_now then v_now else window_started_at end,
          window_seconds = (item->>'window_seconds')::integer,
          updated_at = v_now
      where bucket = item->>'bucket';
  end loop;

  -- Occasionally prune buckets whose window ended more than a day ago.
  if random() < 0.02 then
    delete from public.ai_rate_limits
      where updated_at < v_now - interval '2 days'
        and window_started_at + make_interval(secs => window_seconds) < v_now - interval '1 day';
  end if;

  return jsonb_build_object('allowed', true, 'bucket', null, 'hits', null, 'limit', null, 'retry_after_seconds', 0);
end;
$$;

revoke all on function public.consume_ai_rate_limits(jsonb) from public, anon, authenticated;
grant execute on function public.consume_ai_rate_limits(jsonb) to service_role;

comment on table public.ai_rate_limits is
  'Fixed-window counters that limit paid AI generation per IP (hashed), per monster submission, and globally per day.';
