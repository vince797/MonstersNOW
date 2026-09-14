create table public.storybook_orders (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null unique,
  stripe_checkout_session_id text unique,
  customer_email text not null,
  child_name text not null,
  monster_name text not null,
  story_id text not null,
  story_label text not null,
  format_id text not null check (format_id in ('softcover', 'hardcover')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'checkout_started'
    check (status in ('checkout_started', 'paid', 'proofing', 'approved', 'printing', 'shipped', 'completed', 'cancelled')),
  selected_preview_id text,
  monster_style text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.storybook_orders enable row level security;
revoke all on table public.storybook_orders from anon, authenticated;
grant select, insert, update on table public.storybook_orders to service_role;

create index storybook_orders_status_created_idx
  on public.storybook_orders (status, created_at desc);

comment on table public.storybook_orders is
  'Server-managed personalized storybook order tracker. Contains private customer information.';
