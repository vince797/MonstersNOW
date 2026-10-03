alter table public.storybook_orders
  add column if not exists order_access_token_hash text,
  add column if not exists customer_proof_status text not null default 'not_ready',
  add column if not exists customer_proof_path text,
  add column if not exists customer_proof_fingerprint text,
  add column if not exists customer_proof_master_version integer,
  add column if not exists customer_proof_ready_at timestamptz,
  add column if not exists customer_proof_reviewed_at timestamptz,
  add column if not exists customer_proof_revision_notes text,
  add column if not exists customer_proof_revision_count integer not null default 0;

do $$ begin
  alter table public.storybook_orders
    add constraint storybook_orders_access_token_hash_format
    check (order_access_token_hash is null or char_length(order_access_token_hash) = 64);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.storybook_orders
    add constraint storybook_orders_customer_proof_status
    check (customer_proof_status in ('not_ready', 'ready', 'changes_requested', 'approved'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.storybook_orders
    add constraint storybook_orders_customer_proof_fingerprint_format
    check (customer_proof_fingerprint is null or customer_proof_fingerprint ~ '^[a-f0-9]{64}$');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.storybook_orders
    add constraint storybook_orders_customer_proof_revision_count
    check (customer_proof_revision_count >= 0);
exception when duplicate_object then null;
end $$;

create unique index if not exists storybook_orders_access_token_hash_idx
  on public.storybook_orders (order_access_token_hash)
  where order_access_token_hash is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-proofs',
  'customer-proofs',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

revoke all on table public.storybook_orders from anon, authenticated;
grant select, insert, update on table public.storybook_orders to service_role;

comment on column public.storybook_orders.order_access_token_hash is
  'SHA-256 hash of the opaque customer order portal credential. The raw token is never stored.';
comment on column public.storybook_orders.customer_proof_path is
  'Private Storage object path for the exact customer-review PDF.';
comment on column public.storybook_orders.customer_proof_fingerprint is
  'SHA-256 fingerprint customers approve and operations later lock for production.';
