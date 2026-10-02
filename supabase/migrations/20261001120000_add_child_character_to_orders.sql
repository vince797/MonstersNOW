alter table public.storybook_orders
  add column if not exists child_character jsonb not null
  default '{"id":"none","label":"Monster only","included":false}'::jsonb;

do $$ begin
  alter table public.storybook_orders
    add constraint storybook_orders_child_character_object
    check (jsonb_typeof(child_character) = 'object');
exception when duplicate_object then null;
end $$;
