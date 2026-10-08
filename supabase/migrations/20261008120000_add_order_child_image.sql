-- Pin the customer-approved child character render to each storybook order.
--
-- Checkout uploads the exact child render bound into the signed proof to the
-- private monster-submissions bucket and stores its object path here, so
-- Admin and the print pipeline use the same child the customer approved.
alter table public.storybook_orders
  add column if not exists child_image_path text;

do $$ begin
  alter table public.storybook_orders
    add constraint storybook_orders_child_image_path_format
    check (
      child_image_path is null
      or (char_length(child_image_path) <= 300 and child_image_path !~ '\.\.')
    );
exception when duplicate_object then null;
end $$;

-- Orders created before this migration was applied kept the path in
-- child_character.imagePath; copy it into the new column.
update public.storybook_orders
  set child_image_path = child_character->>'imagePath'
  where child_image_path is null
    and child_character ? 'imagePath';

comment on column public.storybook_orders.child_image_path is
  'Private Storage path (monster-submissions bucket) of the customer-approved child character render.';
