create extension if not exists pgcrypto;

create table public.master_stories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title_template text not null check (char_length(title_template) between 1 and 160),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_seasonal boolean not null default false,
  available_from date,
  available_until date,
  page_count integer not null default 32 check (page_count = 32),
  pages jsonb not null default '[]'::jsonb check (jsonb_typeof(pages) = 'array'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (available_until is null or available_from is null or available_until >= available_from)
);

alter table public.master_stories enable row level security;

revoke all on table public.master_stories from anon, authenticated;
grant select, insert, update, delete on table public.master_stories to service_role;

create index master_stories_status_updated_idx
  on public.master_stories (status, updated_at desc);

comment on table public.master_stories is
  'Server-managed master story templates. Never exposed directly to public browser clients.';
