alter table public.storybook_orders
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_status text,
  add column if not exists stripe_paid_at timestamptz,
  add column if not exists stripe_subtotal_cents integer check (stripe_subtotal_cents >= 0),
  add column if not exists stripe_shipping_cents integer check (stripe_shipping_cents >= 0),
  add column if not exists stripe_tax_cents integer check (stripe_tax_cents >= 0),
  add column if not exists stripe_total_cents integer check (stripe_total_cents >= 0),
  add column if not exists shipping_name text,
  add column if not exists shipping_phone text,
  add column if not exists shipping_address jsonb,
  add column if not exists payment_issue text,
  add column if not exists payment_issue_at timestamptz;

create unique index if not exists storybook_orders_payment_intent_idx
  on public.storybook_orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

grant select, insert, update on table public.storybook_orders to service_role;

comment on column public.storybook_orders.shipping_address is
  'Private shipping address collected by Stripe Checkout for printer fulfillment.';
comment on column public.storybook_orders.payment_issue is
  'Latest refund or dispute condition that blocks new fulfillment actions.';
