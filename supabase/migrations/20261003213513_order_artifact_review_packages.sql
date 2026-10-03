-- LOCAL REVIEW ONLY: generate/review this migration; do not apply without authorization.
-- Candidate package approval never authorizes paid production or Lulu submission.
alter table public.storybook_orders
  add column if not exists artifact_revision bigint not null default 0,
  add column if not exists active_artifact_package_id uuid,
  add column if not exists artifact_workflow_started_at timestamptz;

create table public.order_render_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.storybook_orders(id) on delete cascade,
  order_revision bigint not null,
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','stale')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, input_fingerprint)
);
create table public.order_artifact_packages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.storybook_orders(id) on delete cascade,
  job_id uuid not null unique references public.order_render_jobs(id),
  order_revision bigint not null,
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  package_hash text not null check (package_hash ~ '^[a-f0-9]{64}$'),
  manifest_path text not null unique,
  manifest jsonb not null check (manifest @> '{"purpose":"review-candidate","productionReady":false}'::jsonb),
  format_id text not null check (format_id in ('softcover','hardcover')),
  status text not null default 'ready' check(status in ('ready','stale')),
  customer_review jsonb,
  admin_review jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, input_fingerprint)
);
alter table public.storybook_orders add constraint storybook_orders_active_artifact_fk
  foreign key (active_artifact_package_id) references public.order_artifact_packages(id) deferrable initially deferred;
alter table public.order_render_jobs enable row level security;
alter table public.order_artifact_packages enable row level security;
revoke all on public.order_render_jobs, public.order_artifact_packages from public, anon, authenticated;
grant select, insert, update on public.order_render_jobs, public.order_artifact_packages to service_role;
create index order_render_jobs_order_updated_idx on public.order_render_jobs(order_id,updated_at desc);
create index order_artifact_packages_order_created_idx on public.order_artifact_packages(order_id,created_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('order-artifacts','order-artifacts',false,20971520,array['application/pdf','application/json'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- No public/anon/authenticated Storage policies. Only the server service role accesses this bucket.

create function public.invalidate_order_artifact_inputs() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if row(new.child_name,new.monster_name,new.child_character,new.story_id,new.format_id,new.monster_submission_id,new.selected_preview_id)
     is distinct from row(old.child_name,old.monster_name,old.child_character,old.story_id,old.format_id,old.monster_submission_id,old.selected_preview_id)
     or (new.payment_issue is distinct from old.payment_issue and new.payment_issue is not null)
     or (old.status='proofing' and new.status<>'proofing') then
    new.artifact_revision := old.artifact_revision+1;
    new.active_artifact_package_id := null;
    new.customer_proof_status := 'not_ready';
    new.customer_proof_fingerprint := null;
    new.customer_proof_path := null;
    new.customer_proof_reviewed_at := null;
    update public.order_artifact_packages set status='stale',customer_review=null,admin_review=null,updated_at=now() where order_id=old.id;
  end if;
  return new;
end $$;
create trigger invalidate_order_artifact_inputs before update on public.storybook_orders
for each row execute function public.invalidate_order_artifact_inputs();

create function public.invalidate_story_artifact_packages() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if row(new.version,new.pages,new.title_template,new.status) is distinct from row(old.version,old.pages,old.title_template,old.status) then
    update public.storybook_orders set artifact_revision=artifact_revision+1,active_artifact_package_id=null,
      customer_proof_status='not_ready',customer_proof_fingerprint=null,customer_proof_path=null,customer_proof_reviewed_at=null
      where story_id in (old.id::text,old.slug,new.slug);
    update public.order_artifact_packages p set status='stale',customer_review=null,admin_review=null,updated_at=now()
      from public.storybook_orders o where p.order_id=o.id and o.story_id in (old.id::text,old.slug,new.slug);
  end if; return new;
end $$;
create trigger invalidate_story_artifact_packages after update on public.master_stories
for each row execute function public.invalidate_story_artifact_packages();

create function public.invalidate_preview_artifact_packages() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if row(new.preview_path,new.status,new.completed_at) is distinct from row(old.preview_path,old.status,old.completed_at) then
    update public.storybook_orders set artifact_revision=artifact_revision+1,active_artifact_package_id=null,
      customer_proof_status='not_ready',customer_proof_fingerprint=null,customer_proof_path=null,customer_proof_reviewed_at=null
      where selected_preview_id=old.id::text;
    update public.order_artifact_packages p set status='stale',customer_review=null,admin_review=null,updated_at=now()
      from public.storybook_orders o where p.order_id=o.id and o.selected_preview_id=old.id::text;
  end if; return new;
end $$;
create trigger invalidate_preview_artifact_packages after update on public.monster_previews
for each row execute function public.invalidate_preview_artifact_packages();

create function public.guard_immutable_artifact_package() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if row(new.order_id,new.job_id,new.order_revision,new.input_fingerprint,new.package_hash,new.manifest_path,new.manifest,new.format_id)
    is distinct from row(old.order_id,old.job_id,old.order_revision,old.input_fingerprint,old.package_hash,old.manifest_path,old.manifest,old.format_id)
 then raise exception 'Immutable artifact package cannot be changed'; end if;
 return new;
end $$;
create trigger guard_immutable_artifact_package before update on public.order_artifact_packages
for each row execute function public.guard_immutable_artifact_package();

create function public.assert_artifact_source_snapshot(p_order_id uuid,p_revision bigint,p_snapshot jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.storybook_orders; s public.master_stories; v public.monster_previews; k text;
begin
 if p_order_id is null or p_revision is null or jsonb_typeof(p_snapshot) is distinct from 'object' then raise exception 'Snapshot is required'; end if;
 foreach k in array array['orderId','revision','storyId','storyVersion','storyUpdatedAt','previewId','previewPath','format'] loop
  if nullif(trim(p_snapshot->>k),'') is null then raise exception 'Snapshot field % is required',k; end if;
 end loop;
 if jsonb_typeof(p_snapshot->'personalization') is distinct from 'object' then raise exception 'Personalization is required'; end if;
 select * into o from public.storybook_orders where id=p_order_id;
 if not found or o.artifact_revision is distinct from p_revision or o.status is distinct from 'proofing' or o.payment_issue is not null
 then raise exception 'Artifact sources changed or order locked'; end if;
 if (p_snapshot->>'revision')::bigint is distinct from p_revision or p_snapshot->>'orderId' is distinct from o.id::text
 or p_snapshot->'personalization'->>'childName' is distinct from o.child_name
 or p_snapshot->'personalization'->>'monsterName' is distinct from o.monster_name
 or p_snapshot->'personalization'->>'childCharacter' is distinct from coalesce(o.child_character->>'id','none')
 then raise exception 'Artifact personalization changed'; end if;
 select * into s from public.master_stories where id=(p_snapshot->>'storyId')::uuid;
 if not found or s.version is distinct from (p_snapshot->>'storyVersion')::integer or s.updated_at is distinct from (p_snapshot->>'storyUpdatedAt')::timestamptz or s.status='archived' or (o.story_id is distinct from s.id::text and o.story_id is distinct from s.slug)
 then raise exception 'Master story changed'; end if;
 select * into v from public.monster_previews where id=(p_snapshot->>'previewId')::uuid;
 if not found or v.id::text is distinct from o.selected_preview_id or v.submission_id is distinct from o.monster_submission_id or v.status is distinct from 'complete'
 or v.preview_path is distinct from p_snapshot->>'previewPath' or o.format_id is distinct from p_snapshot->>'format'
 or v.completed_at is distinct from nullif(p_snapshot->>'previewCompletedAt','')::timestamptz
 then raise exception 'Selected preview or format changed'; end if;
end $$;

create function public.claim_order_render_job(p_order_id uuid,p_revision bigint,p_input_fingerprint text,p_source_snapshot jsonb,p_lease_token uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare j public.order_render_jobs;
begin
 if p_lease_token is null or p_input_fingerprint is null or p_input_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Render identity and lease are required'; end if;
 perform 1 from public.storybook_orders where id=p_order_id for update;
 perform public.assert_artifact_source_snapshot(p_order_id,p_revision,p_source_snapshot);
 update public.storybook_orders set artifact_workflow_started_at=coalesce(artifact_workflow_started_at,now()) where id=p_order_id;
 insert into public.order_render_jobs(order_id,order_revision,input_fingerprint,source_snapshot)
 values(p_order_id,p_revision,p_input_fingerprint,p_source_snapshot) on conflict(order_id,input_fingerprint) do nothing;
 select * into j from public.order_render_jobs where order_id=p_order_id and input_fingerprint=p_input_fingerprint for update;
 if j.status='completed' and exists(select 1 from public.order_artifact_packages p join public.storybook_orders o on o.id=p.order_id where p.job_id=j.id and p.status='ready' and o.active_artifact_package_id=p.id)
 or j.status='running' and j.lease_until>now() then return jsonb_build_object('claimed',false,'job',to_jsonb(j)); end if;
 update public.order_render_jobs set status='running',attempts=attempts+1,lease_token=p_lease_token,lease_until=now()+interval '10 minutes',error_code=null,updated_at=now()
 where id=j.id returning * into j;
 return jsonb_build_object('claimed',true,'job',to_jsonb(j));
end $$;

create function public.finish_order_render_job(p_job_id uuid,p_lease_token uuid,p_package_hash text,p_manifest_path text,p_manifest jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare j public.order_render_jobs; p public.order_artifact_packages;
begin
 if p_job_id is null or p_lease_token is null or p_package_hash is null or p_package_hash !~ '^[a-f0-9]{64}$' or p_manifest_path is null or jsonb_typeof(p_manifest) is distinct from 'object' then raise exception 'Complete package arguments are required'; end if;
 select * into j from public.order_render_jobs where id=p_job_id;
 perform 1 from public.storybook_orders where id=j.order_id for update;
 select * into j from public.order_render_jobs where id=p_job_id for update;
 if j.id is null or j.status is distinct from 'running' or j.lease_token is distinct from p_lease_token or j.lease_until is null or j.lease_until<=now() then raise exception 'Render lease lost'; end if;
 perform public.assert_artifact_source_snapshot(j.order_id,j.order_revision,j.source_snapshot);
 if p_manifest->>'sourceFingerprint' is distinct from j.input_fingerprint or p_manifest->>'orderId' is distinct from j.order_id::text
 or not (p_manifest @> '{"purpose":"review-candidate","productionReady":false}'::jsonb)
 or p_manifest->>'format' is distinct from j.source_snapshot->>'format'
 or p_manifest_path is distinct from j.order_id::text||'/'||j.input_fingerprint||'/package-'||p_package_hash||'.json'
 then raise exception 'Package identity mismatch'; end if;
 insert into public.order_artifact_packages(order_id,job_id,order_revision,input_fingerprint,package_hash,manifest_path,manifest,format_id)
 values(j.order_id,j.id,j.order_revision,j.input_fingerprint,p_package_hash,p_manifest_path,p_manifest,p_manifest->>'format')
 on conflict(job_id) do nothing;
 select * into p from public.order_artifact_packages where job_id=j.id for update;
 if p.package_hash is distinct from p_package_hash then raise exception 'Immutable package bytes differ'; end if;
 update public.order_artifact_packages set status='ready',customer_review=null,admin_review=null,updated_at=now() where id=p.id;
 update public.storybook_orders set active_artifact_package_id=p.id,customer_proof_status='not_ready',customer_proof_path=null,customer_proof_fingerprint=null,customer_proof_reviewed_at=null,updated_at=now() where id=j.order_id;
 update public.order_render_jobs set status='completed',lease_token=null,lease_until=null,error_code=null,updated_at=now() where id=j.id;
 return jsonb_build_object('packageId',p.id,'packageHash',p.package_hash);
end $$;

create function public.fail_order_render_job(p_job_id uuid,p_lease_token uuid,p_error_code text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.order_render_jobs set status=case when p_error_code='artifact_source_changed' then 'stale' else 'failed' end,error_code=left(p_error_code,100),lease_token=null,lease_until=null,updated_at=now()
 where id=p_job_id and status='running' and lease_token=p_lease_token;
end $$;

create function public.invalidate_order_artifact_package(p_order_id uuid,p_package_id uuid,p_reason text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform 1 from public.storybook_orders where id=p_order_id for update;
 update public.order_artifact_packages set status='stale',customer_review=null,admin_review=null,updated_at=now() where id=p_package_id and order_id=p_order_id;
 update public.storybook_orders set active_artifact_package_id=null where id=p_order_id and active_artifact_package_id=p_package_id;
end $$;

create function public.review_order_artifact_package(p_order_id uuid,p_package_id uuid,p_package_hash text,p_revision bigint,p_role text,p_action text,p_actor text,p_notes text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.storybook_orders; p public.order_artifact_packages; r jsonb;
begin
 if p_order_id is null or p_package_id is null or p_revision is null or p_package_hash is null or p_package_hash !~ '^[a-f0-9]{64}$' or p_role is null or p_action is null or nullif(trim(p_actor),'') is null then raise exception 'Complete review arguments are required'; end if;
 select * into o from public.storybook_orders where id=p_order_id for update;
 select * into p from public.order_artifact_packages where id=p_package_id and order_id=p_order_id for update;
 if o.id is null or p.id is null or o.active_artifact_package_id is distinct from p.id or p.package_hash is distinct from p_package_hash or p.status is distinct from 'ready' or p.order_revision is distinct from p_revision
 then raise exception 'Artifact package changed'; end if;
 perform public.assert_artifact_source_snapshot(p_order_id,p_revision,p.manifest->'sourceSnapshot');
 if p_role not in ('customer','administrator') or p_action not in ('approve','request_changes') then raise exception 'Invalid artifact review'; end if;
 if p_action='request_changes' and length(coalesce(trim(p_notes),''))<3 then raise exception 'Revision notes required'; end if;
 if p_action='approve' and (coalesce(p.customer_review->>'status','')='changes_requested' or coalesce(p.admin_review->>'status','')='changes_requested') then raise exception 'A revised package is required'; end if;
 r:=jsonb_build_object('status',case when p_action='approve' then 'approved' else 'changes_requested' end,'packageHash',p_package_hash,'reviewedAt',now(),'actor',left(p_actor,160),'notes',case when p_action='request_changes' then left(p_notes,1000) else null end);
 update public.order_artifact_packages set
 customer_review=case when p_role='customer' then r else customer_review end,
 admin_review=case when p_role='administrator' then r when p_action='request_changes' then null else admin_review end,updated_at=now() where id=p.id;
 -- Order status intentionally remains proofing. Candidate review is NOT production approval.
end $$;

revoke all on function public.invalidate_order_artifact_inputs(),public.invalidate_story_artifact_packages(),public.invalidate_preview_artifact_packages(),public.guard_immutable_artifact_package(),public.assert_artifact_source_snapshot(uuid,bigint,jsonb),public.claim_order_render_job(uuid,bigint,text,jsonb,uuid),public.finish_order_render_job(uuid,uuid,text,text,jsonb),public.fail_order_render_job(uuid,uuid,text),public.invalidate_order_artifact_package(uuid,uuid,text),public.review_order_artifact_package(uuid,uuid,text,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.assert_artifact_source_snapshot(uuid,bigint,jsonb),public.claim_order_render_job(uuid,bigint,text,jsonb,uuid),public.finish_order_render_job(uuid,uuid,text,text,jsonb),public.fail_order_render_job(uuid,uuid,text),public.invalidate_order_artifact_package(uuid,uuid,text),public.review_order_artifact_package(uuid,uuid,text,bigint,text,text,text,text) to service_role;
comment on table public.order_artifact_packages is 'Private immutable watermarked review byte packages. Customer/admin review never grants production readiness.';
