create table public.monster_submissions (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique check (char_length(access_token_hash) = 64),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'ordered', 'expired')),
  source_filename text not null default '',
  original_path text not null,
  selected_preview_id uuid,
  customer_email text,
  child_name text,
  monster_name text,
  story_id text,
  format_id text check (format_id is null or format_id in ('softcover', 'hardcover')),
  feature_permission jsonb not null default '{}'::jsonb
    check (jsonb_typeof(feature_permission) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create table public.monster_previews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.monster_submissions(id) on delete cascade,
  variation_number integer not null check (variation_number between 1 and 3),
  style_id text not null,
  model text not null,
  status text not null default 'pending'
    check (status in ('pending', 'complete', 'error')),
  preview_path text,
  coloring_page_path text,
  error_code text,
  estimated_cost_cents integer check (estimated_cost_cents is null or estimated_cost_cents >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (submission_id, variation_number)
);

alter table public.monster_submissions
  add constraint monster_submissions_selected_preview_fk
  foreign key (selected_preview_id)
  references public.monster_previews(id)
  on delete set null;

alter table public.storybook_orders
  add column monster_submission_id uuid references public.monster_submissions(id) on delete set null;

alter table public.monster_submissions enable row level security;
alter table public.monster_previews enable row level security;

revoke all on table public.monster_submissions from anon, authenticated;
revoke all on table public.monster_previews from anon, authenticated;
grant select, insert, update, delete on table public.monster_submissions to service_role;
grant select, insert, update, delete on table public.monster_previews to service_role;

create index monster_submissions_status_created_idx
  on public.monster_submissions (status, created_at desc);

create index monster_submissions_expires_idx
  on public.monster_submissions (expires_at)
  where status in ('draft', 'ready');

create index monster_previews_submission_created_idx
  on public.monster_previews (submission_id, created_at);

create index storybook_orders_monster_submission_idx
  on public.storybook_orders (monster_submission_id)
  where monster_submission_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'monster-submissions',
  'monster-submissions',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.monster_submissions is
  'Server-managed private customer monster uploads. Browser access requires a short-lived opaque submission token verified by API routes.';

comment on table public.monster_previews is
  'Persistent AI monster generations and coloring pages associated with a private customer submission.';
