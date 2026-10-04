alter table public.monster_previews
  add constraint monster_previews_id_submission_unique unique (id, submission_id);

create table public.storybook_pose_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.monster_submissions(id) on delete cascade,
  source_preview_id uuid not null references public.monster_previews(id) on delete restrict,
  story_id text not null,
  story_version integer not null check (story_version > 0),
  child_profile_key text,
  child_anchor_path text,
  status text not null default 'planned' check (status in ('planned', 'generating', 'review', 'approved', 'blocked', 'failed', 'invalidated')),
  pose_plan jsonb not null,
  model text not null default 'gpt-image-1.5',
  quality text not null default 'low',
  cost_cap_cents integer not null default 50 check (cost_cap_cents between 1 and 500),
  estimated_cost_cents integer not null default 0 check (estimated_cost_cents >= 0),
  actual_cost_cents integer not null default 0 check (actual_cost_cents >= 0),
  error_code text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pose_job_preview_belongs_to_submission foreign key (source_preview_id, submission_id)
    references public.monster_previews(id, submission_id) on delete restrict
);

create unique index storybook_pose_jobs_active_version_idx
  on public.storybook_pose_jobs (submission_id, source_preview_id, story_id, story_version, coalesce(child_profile_key, ''))
  where status <> 'invalidated';

create table public.storybook_pose_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.storybook_pose_jobs(id) on delete cascade,
  asset_key text not null,
  subject_type text not null check (subject_type in ('monster', 'child')),
  asset_kind text not null check (asset_kind in ('base', 'scene_adaptation')),
  pose_id text not null,
  page_number integer check (page_number is null or page_number between 1 and 32),
  status text not null default 'queued' check (status in ('queued', 'generating', 'review', 'approved', 'failed', 'blocked')),
  attempts integer not null default 0 check (attempts between 0 and 2),
  max_attempts integer not null default 2 check (max_attempts between 1 and 2),
  model text,
  quality text,
  prompt_version text not null default 'storybook-pose-v1',
  prompt_text text,
  asset_path text,
  has_transparency boolean not null default false,
  identity_approved boolean not null default false,
  anatomy_approved boolean not null default false,
  visual_bounds jsonb,
  qa jsonb not null default '{}'::jsonb,
  estimated_cost_cents integer not null default 0 check (estimated_cost_cents >= 0),
  actual_cost_cents integer not null default 0 check (actual_cost_cents >= 0),
  provider_request_id text,
  error_code text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, asset_key)
);

create table public.storybook_scene_mappings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.storybook_pose_jobs(id) on delete cascade,
  page_number integer not null check (page_number between 1 and 32),
  status text not null default 'review' check (status in ('not_required', 'review', 'approved', 'blocked')),
  monster_asset_key text,
  child_asset_key text,
  composition jsonb not null,
  qa jsonb not null default '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, page_number)
);

alter table public.storybook_pose_jobs enable row level security;
alter table public.storybook_pose_assets enable row level security;
alter table public.storybook_scene_mappings enable row level security;

revoke all on table public.storybook_pose_jobs from anon, authenticated;
revoke all on table public.storybook_pose_assets from anon, authenticated;
revoke all on table public.storybook_scene_mappings from anon, authenticated;
grant select, insert, update, delete on table public.storybook_pose_jobs to service_role;
grant select, insert, update, delete on table public.storybook_pose_assets to service_role;
grant select, insert, update, delete on table public.storybook_scene_mappings to service_role;

create index storybook_pose_jobs_submission_idx on public.storybook_pose_jobs (submission_id, updated_at desc);
create index storybook_pose_assets_job_status_idx on public.storybook_pose_assets (job_id, status, subject_type, asset_kind);
create index storybook_scene_mappings_job_status_idx on public.storybook_scene_mappings (job_id, status, page_number);

comment on table public.storybook_pose_jobs is
  'Bounded internal pose-production jobs pinned to one exact customer-approved monster preview and one story version.';
comment on table public.storybook_pose_assets is
  'Transparent monster and child base poses plus explicitly requested page adaptations, each with bounded attempts and human QA.';
comment on table public.storybook_scene_mappings is
  'Per-page pose selection and camera-aware composition review, including relative scale, bounds, eyelines, and interaction clearance.';
