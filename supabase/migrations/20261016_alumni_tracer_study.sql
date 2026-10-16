begin;

alter table public.alumni_verifications add column if not exists tracer_status text;
alter table public.alumni_verifications add column if not exists tracer_country text;
alter table public.alumni_verifications add column if not exists tracer_region text;
alter table public.alumni_verifications add column if not exists tracer_city text;
alter table public.alumni_verifications add column if not exists tracer_employer text;
alter table public.alumni_verifications add column if not exists tracer_job_title text;
alter table public.alumni_verifications add column if not exists tracer_industry text;
alter table public.alumni_verifications add column if not exists tracer_employment_type text;
alter table public.alumni_verifications add column if not exists tracer_degree_related boolean;
alter table public.alumni_verifications add column if not exists tracer_study_program text;
alter table public.alumni_verifications add column if not exists tracer_study_institution text;
alter table public.alumni_verifications add column if not exists tracer_consent boolean;
alter table public.alumni_verifications add column if not exists tracer_submitted_at timestamptz;
alter table public.alumni_verifications alter column tracer_submitted_at set default now();

alter table public.alumni_verifications drop constraint if exists alumni_verifications_tracer_status_check;
alter table public.alumni_verifications add constraint alumni_verifications_tracer_status_check
  check (tracer_status is null or tracer_status in ('employed','self_employed','further_studies','seeking_work','not_seeking','other'));
alter table public.alumni_verifications drop constraint if exists alumni_verifications_tracer_employment_type_check;
alter table public.alumni_verifications add constraint alumni_verifications_tracer_employment_type_check
  check (tracer_employment_type is null or tracer_employment_type in ('full_time','part_time','contract','temporary','freelance','internship','other'));
alter table public.alumni_verifications drop constraint if exists alumni_verifications_tracer_lengths_check;
alter table public.alumni_verifications add constraint alumni_verifications_tracer_lengths_check check (
  char_length(coalesce(tracer_country,'')) <= 100 and char_length(coalesce(tracer_region,'')) <= 120
  and char_length(coalesce(tracer_city,'')) <= 120 and char_length(coalesce(tracer_employer,'')) <= 160
  and char_length(coalesce(tracer_job_title,'')) <= 160 and char_length(coalesce(tracer_industry,'')) <= 120
  and char_length(coalesce(tracer_study_program,'')) <= 160 and char_length(coalesce(tracer_study_institution,'')) <= 160
);
alter table public.alumni_verifications drop constraint if exists alumni_verifications_tracer_submission_check;
alter table public.alumni_verifications add constraint alumni_verifications_tracer_submission_check check (
  tracer_submitted_at is null or (tracer_consent is true and tracer_country is not null and tracer_country ~ '^[A-Z]{2}$' and tracer_status is not null)
);
create index if not exists alumni_verifications_tracer_latest_idx
  on public.alumni_verifications(user_id, tracer_submitted_at desc, id desc)
  where tracer_submitted_at is not null;

drop policy if exists "Users can submit own verification" on public.alumni_verifications;
create policy "Users can submit own verification" on public.alumni_verifications
for insert to authenticated with check (
  user_id = auth.uid() and status = 'pending' and tracer_submitted_at is not null
  and tracer_consent is true and nullif(trim(tracer_country),'') is not null and tracer_status is not null
);

create or replace function public.admin_tracer_study_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (v.user_id) v.user_id,v.tracer_status,v.tracer_country,v.program,v.graduation_year,v.tracer_submitted_at
    from public.alumni_verifications v join public.profiles p on p.id=v.user_id
    where v.tracer_submitted_at is not null and p.role='alumni' and p.status='verified'
    order by v.user_id,v.tracer_submitted_at desc,v.id desc
  ), totals as (select count(*)::integer response_count,max(tracer_submitted_at) last_updated from latest)
  select jsonb_build_object(
    'response_count',totals.response_count,
    'verified_alumni_count',(select count(*)::integer from public.profiles where role='alumni' and status='verified'),
    'response_rate',case when (select count(*) from public.profiles where role='alumni' and status='verified')=0 then 0
      else round(totals.response_count*100.0/(select count(*) from public.profiles where role='alumni' and status='verified'),1) end,
    'last_updated',totals.last_updated,
    'by_status',coalesce((select jsonb_agg(jsonb_build_object('value',g.tracer_status,'count',g.amount) order by g.amount desc)
      from (select tracer_status,count(*)::integer amount from latest group by tracer_status having count(*)>=3) g),'[]'::jsonb),
    'by_country',coalesce((select jsonb_agg(jsonb_build_object('value',g.country,'count',g.amount) order by g.amount desc)
      from (select lower(trim(tracer_country)) country,count(*)::integer amount from latest group by lower(trim(tracer_country)) having count(*)>=3 order by amount desc limit 20) g),'[]'::jsonb),
    'by_program',coalesce((select jsonb_agg(jsonb_build_object('value',g.program,'count',g.amount) order by g.amount desc)
      from (select program,count(*)::integer amount from latest group by program having count(*)>=3 order by amount desc limit 20) g),'[]'::jsonb)
  ) from totals;
$$;
revoke all on function public.admin_tracer_study_summary() from public,anon,authenticated;
grant execute on function public.admin_tracer_study_summary() to service_role;

create or replace function public.admin_tracer_study_responses(
  p_search text default '', p_country text default '', p_limit integer default 50, p_offset integer default 0
)
returns table(
  user_id uuid, first_name text, last_name text, email text, program text, graduation_year smallint,
  tracer_status text, tracer_country text, tracer_region text, tracer_city text, tracer_employer text,
  tracer_job_title text, tracer_industry text, tracer_employment_type text, tracer_degree_related boolean,
  tracer_study_program text, tracer_study_institution text, tracer_submitted_at timestamptz, total_count bigint
)
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (v.user_id) v.* from public.alumni_verifications v
    join public.profiles p on p.id=v.user_id
    where v.tracer_submitted_at is not null and p.role='alumni' and p.status='verified'
    order by v.user_id,v.tracer_submitted_at desc,v.id desc
  ), filtered as (
    select l.*,p.first_name,p.last_name,p.email from latest l join public.profiles p on p.id=l.user_id
    where (coalesce(trim(p_search),'')='' or concat_ws(' ',p.first_name,p.last_name,p.email,l.program,l.tracer_country,l.tracer_employer,l.tracer_job_title) ilike '%'||trim(p_search)||'%')
      and (coalesce(trim(p_country),'')='' or lower(l.tracer_country)=lower(trim(p_country)))
  )
  select f.user_id,f.first_name,f.last_name,f.email,f.program,f.graduation_year,f.tracer_status,f.tracer_country,
    f.tracer_region,f.tracer_city,f.tracer_employer,f.tracer_job_title,f.tracer_industry,f.tracer_employment_type,
    f.tracer_degree_related,f.tracer_study_program,f.tracer_study_institution,f.tracer_submitted_at,count(*) over()
  from filtered f order by f.tracer_submitted_at desc,f.user_id
  limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.admin_tracer_study_responses(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_tracer_study_responses(text,text,integer,integer) to service_role;

create or replace function public.update_own_tracer_study(
  p_status text, p_country text, p_region text, p_city text, p_employer text, p_job_title text,
  p_industry text, p_employment_type text, p_degree_related boolean, p_study_program text,
  p_study_institution text, p_consent boolean
)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare submitted_at timestamptz;
begin
  if not public.is_verified_user() then raise exception 'A verified alumni account is required.'; end if;
  if p_consent is not true or p_country is null or p_country !~ '^[A-Z]{2}$' or p_status not in ('employed','self_employed','further_studies','seeking_work','not_seeking','other') then
    raise exception 'A current status, country, and consent are required.';
  end if;
  if char_length(p_country)>100 or char_length(coalesce(p_region,''))>120 or char_length(coalesce(p_city,''))>120
    or char_length(coalesce(p_employer,''))>160 or char_length(coalesce(p_job_title,''))>160
    or char_length(coalesce(p_industry,''))>120 or char_length(coalesce(p_study_program,''))>160
    or char_length(coalesce(p_study_institution,''))>160 then raise exception 'Tracer study details exceed the allowed length.'; end if;
  if p_employment_type is not null and p_employment_type not in ('full_time','part_time','contract','temporary','freelance','internship','other') then raise exception 'Invalid employment type.'; end if;
  update public.alumni_verifications v
  set tracer_status=p_status,tracer_country=trim(p_country),tracer_region=nullif(trim(coalesce(p_region,'')),''),
    tracer_city=nullif(trim(coalesce(p_city,'')),''),tracer_employer=nullif(trim(coalesce(p_employer,'')),''),
    tracer_job_title=nullif(trim(coalesce(p_job_title,'')),''),tracer_industry=nullif(trim(coalesce(p_industry,'')),''),
    tracer_employment_type=p_employment_type,tracer_degree_related=p_degree_related,
    tracer_study_program=nullif(trim(coalesce(p_study_program,'')),''),tracer_study_institution=nullif(trim(coalesce(p_study_institution,'')),''),
    tracer_consent=true,tracer_submitted_at=now()
  where v.id=(select id from public.alumni_verifications where user_id=auth.uid() and status='verified' order by reviewed_at desc nulls last,created_at desc limit 1)
  returning v.tracer_submitted_at into submitted_at;
  if submitted_at is null then raise exception 'A verified graduation record is required before updating tracer details.'; end if;
  return submitted_at;
end;
$$;
revoke all on function public.update_own_tracer_study(text,text,text,text,text,text,text,text,boolean,text,text,boolean) from public,anon;
grant execute on function public.update_own_tracer_study(text,text,text,text,text,text,text,text,boolean,text,text,boolean) to authenticated;

commit;
