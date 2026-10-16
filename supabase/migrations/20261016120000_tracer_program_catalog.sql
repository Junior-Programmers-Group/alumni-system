begin;

create or replace function public.admin_tracer_study_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (v.user_id)
      v.user_id, v.tracer_status, v.tracer_country,
      coalesce(nullif(trim(e.course), ''), nullif(trim(v.program), '')) as program,
      coalesce(nullif(trim(e.degree), ''), '') as degree,
      v.graduation_year, v.tracer_submitted_at,
      coalesce(nullif(trim(e.department), ''), 'Unspecified') as department
    from public.alumni_verifications v
    join public.profiles p on p.id = v.user_id
    left join lateral (
      select education.degree, education.course, education.department from public.education
      where education.profile_id = v.user_id
      order by education.created_at desc limit 1
    ) e on true
    where v.tracer_submitted_at is not null and p.role = 'alumni' and p.status = 'verified'
    order by v.user_id, v.tracer_submitted_at desc, v.id desc
  ), totals as (
    select count(*)::integer as response_count, max(tracer_submitted_at) as last_updated from latest
  )
  select jsonb_build_object(
    'response_count', totals.response_count,
    'verified_alumni_count', (select count(*)::integer from public.profiles where role = 'alumni' and status = 'verified'),
    'response_rate', case
      when (select count(*) from public.profiles where role = 'alumni' and status = 'verified') = 0 then 0
      else round(totals.response_count * 100.0 / (select count(*) from public.profiles where role = 'alumni' and status = 'verified'), 1)
    end,
    'last_updated', totals.last_updated,
    'by_status', coalesce((
      select jsonb_agg(jsonb_build_object('value', grouped.tracer_status, 'count', grouped.amount) order by grouped.amount desc)
      from (select tracer_status, count(*)::integer as amount from latest group by tracer_status having count(*) >= 3) grouped
    ), '[]'::jsonb),
    'by_country', coalesce((
      select jsonb_agg(jsonb_build_object('value', grouped.country, 'count', grouped.amount) order by grouped.amount desc)
      from (select lower(trim(tracer_country)) as country, count(*)::integer as amount from latest group by lower(trim(tracer_country)) having count(*) >= 3 order by amount desc limit 20) grouped
    ), '[]'::jsonb),
    'by_department', coalesce((
      select jsonb_agg(jsonb_build_object('value', grouped.department, 'count', grouped.amount) order by grouped.amount desc)
      from (select department, count(*)::integer as amount from latest group by department having count(*) >= 3 order by amount desc limit 20) grouped
    ), '[]'::jsonb),
    'by_program', coalesce((
      select jsonb_agg(jsonb_build_object('value', grouped.program, 'count', grouped.amount) order by grouped.amount desc)
      from (select program, count(*)::integer as amount from latest where nullif(trim(program), '') is not null group by program having count(*) >= 3 order by amount desc limit 100) grouped
    ), '[]'::jsonb)
  ) from totals;
$$;

revoke all on function public.admin_tracer_study_summary() from public, anon, authenticated;
grant execute on function public.admin_tracer_study_summary() to service_role;

drop function if exists public.admin_tracer_study_responses(text, text, integer, integer);
drop function if exists public.admin_tracer_study_responses(text, text, text, text, integer, integer);

create function public.admin_tracer_study_responses(
  p_search text default '',
  p_country text default '',
  p_department text default '',
  p_program text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  user_id uuid, first_name text, last_name text, email text, degree text, program text, department text, graduation_year smallint,
  tracer_status text, tracer_country text, tracer_region text, tracer_city text, tracer_employer text,
  tracer_job_title text, tracer_industry text, tracer_employment_type text, tracer_degree_related boolean,
  tracer_study_program text, tracer_study_institution text, tracer_submitted_at timestamptz, total_count bigint
)
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (v.user_id)
      v.*,
      coalesce(nullif(trim(e.course), ''), nullif(trim(v.program), '')) as academic_program,
      coalesce(nullif(trim(e.degree), ''), '') as degree,
      coalesce(nullif(trim(e.department), ''), 'Unspecified') as department
    from public.alumni_verifications v
    join public.profiles p on p.id = v.user_id
    left join lateral (
      select education.degree, education.course, education.department from public.education
      where education.profile_id = v.user_id
      order by education.created_at desc limit 1
    ) e on true
    where v.tracer_submitted_at is not null and p.role = 'alumni' and p.status = 'verified'
    order by v.user_id, v.tracer_submitted_at desc, v.id desc
  ), filtered as (
    select latest.*, p.first_name, p.last_name, p.email
    from latest join public.profiles p on p.id = latest.user_id
    where (coalesce(trim(p_search), '') = '' or concat_ws(' ', p.first_name, p.last_name, p.email, latest.academic_program, latest.degree, latest.department, latest.tracer_country, latest.tracer_employer, latest.tracer_job_title) ilike '%' || trim(p_search) || '%')
      and (coalesce(trim(p_country), '') = '' or lower(latest.tracer_country) = lower(trim(p_country)))
      and (coalesce(trim(p_department), '') = '' or lower(latest.department) = lower(trim(p_department)))
      and (coalesce(trim(p_program), '') = '' or lower(latest.academic_program) = lower(trim(p_program)))
  )
  select filtered.user_id, filtered.first_name, filtered.last_name, filtered.email, filtered.degree, filtered.academic_program, filtered.department,
    filtered.graduation_year, filtered.tracer_status, filtered.tracer_country, filtered.tracer_region, filtered.tracer_city,
    filtered.tracer_employer, filtered.tracer_job_title, filtered.tracer_industry, filtered.tracer_employment_type,
    filtered.tracer_degree_related, filtered.tracer_study_program, filtered.tracer_study_institution,
    filtered.tracer_submitted_at, count(*) over()
  from filtered
  order by filtered.tracer_submitted_at desc, filtered.user_id
  limit greatest(1, least(coalesce(p_limit, 50), 100)) offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.admin_tracer_study_responses(text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_tracer_study_responses(text, text, text, text, integer, integer) to service_role;

commit;
