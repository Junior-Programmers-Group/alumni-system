import { useCallback, useEffect, useState } from 'react';
import { adminApi } from './lib/adminApi.js';
import { countryName } from '../../data/countries.js';
import { ACADEMIC_PROGRAMS, DEPARTMENTS, departmentForCourse } from '../../data/academics.js';
import './TracerStudy.css';

const PAGE_SIZE = 50;
const label = (value = '') => String(value).replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

function Breakdown({ title, rows, empty, formatValue = label, onSelect, selected }) {
  const highestCount = Math.max(1, ...(rows || []).map(row => row.count));

  return (
    <section className="tracer-breakdown" aria-label={`${title} breakdown`}>
      <h2>{title}</h2>
      {rows?.length ? (
        <ul>
          {rows.map(row => {
            const active = selected === row.value;
            const content = (
              <>
                <span className="tracer-breakdown-label">{formatValue(row.value)}</span>
                <span className="tracer-breakdown-value">
                  <strong>{row.count}</strong>
                  <span>{row.count === 1 ? 'response' : 'responses'}</span>
                </span>
                <span className="tracer-breakdown-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(8, (row.count / highestCount) * 100)}%` }} />
                </span>
              </>
            );

            return (
              <li key={row.value}>
                {onSelect ? (
                  <button type="button" className={active ? 'selected' : ''} onClick={() => onSelect(active ? '' : row.value)} aria-pressed={active}>
                    {content}
                  </button>
                ) : <div className="tracer-breakdown-row">{content}</div>}
              </li>
            );
          })}
        </ul>
      ) : <p className="tracer-breakdown-empty">{empty}</p>}
    </section>
  );
}

function SummaryCard({ label: title, value, detail, icon }) {
  return (
    <article className="tracer-summary-card">
      <span className="tracer-summary-icon" aria-hidden="true">{icon}</span>
      <div>
        <span className="tracer-summary-label">{title}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

export default function TracerStudy() {
  const [summary, setSummary] = useState(null);
  const [responses, setResponses] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [department, setDepartment] = useState('');
  const [program, setProgram] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    const result = await adminApi('/api/admin/verifications/tracer-summary');
    setSummary(result.summary || {});
  }, []);

  const loadResponses = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), search, country, department, program });
    try {
      const result = await adminApi(`/api/admin/verifications/tracer-responses?${query}`);
      setResponses(result.responses || []);
      setTotal(result.total || 0);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, country, department, program]);

  useEffect(() => {
    loadSummary().catch(loadError => setError(loadError.message));
  }, [loadSummary]);
  useEffect(() => { loadResponses(); }, [loadResponses]);

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function selectCountry(value) {
    setPage(1);
    setCountry(value);
  }

  function selectDepartment(value) {
    setPage(1);
    setDepartment(value);
    setProgram('');
  }

  function selectProgram(value) {
    setPage(1);
    setProgram(value);
    if (value) setDepartment(departmentForCourse(value));
  }

  function clearFilters() {
    setSearchInput('');
    setSearch('');
    setCountry('');
    setDepartment('');
    setProgram('');
    setPage(1);
  }

  function refresh() {
    loadSummary().catch(loadError => setError(loadError.message));
    loadResponses();
  }

  const countries = summary?.by_country || [];
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(search || country || department || program);
  const programs = department ? ACADEMIC_PROGRAMS[department] || [] : [];
  const departmentOptions = [
    ...DEPARTMENTS,
    ...(summary?.by_department || []).map(item => item.value).filter(value => !DEPARTMENTS.includes(value)),
  ];
  const firstResult = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastResult = Math.min(page * PAGE_SIZE, total);

  return (
    <main className="tracer-study-page">
      <header className="tracer-study-heading">
        <div>
          <p className="admin-kicker">Alumni outcomes</p>
          <h1>Tracer Study</h1>
          <p>See where alumni are working or studying, then explore individual responses.</p>
        </div>
        <button type="button" className="tracer-refresh" onClick={refresh} disabled={loading}>
          <span aria-hidden="true">↻</span> {loading ? 'Refreshing…' : 'Refresh data'}
        </button>
      </header>

      <p className="tracer-data-note"><span aria-hidden="true">ⓘ</span> These are self-reported outcomes from verified alumni. Counts reflect respondents, not all graduates.</p>
      {error && <p className="tracer-study-error" role="alert">{error}</p>}

      <section className="tracer-summary-cards" aria-label="Tracer study overview">
        <SummaryCard label="Responses" value={summary?.response_count ?? '—'} detail="Latest update from each alumnus" icon="▤" />
        <SummaryCard label="Verified alumni" value={summary?.verified_alumni_count ?? '—'} detail="Eligible alumni accounts" icon="◎" />
        <SummaryCard label="Response rate" value={summary ? `${summary.response_rate}%` : '—'} detail="Of verified alumni accounts" icon="↗" />
        <SummaryCard label="Last response" value={dateLabel(summary?.last_updated)} detail="Most recent self-reported update" icon="◷" />
      </section>

      <section className="tracer-breakdown-grid" aria-label="Outcome breakdowns">
        <Breakdown title="Current status" rows={summary?.by_status} empty="No reportable responses yet." />
        <Breakdown title="Country" rows={countries} empty="Country counts appear after at least three responses." formatValue={countryName} onSelect={selectCountry} selected={country} />
        <Breakdown title="Department / college" rows={summary?.by_department} empty="Department counts appear after at least three responses." onSelect={selectDepartment} selected={department} />
        <Breakdown title="Programs" rows={summary?.by_program} empty="Program counts appear after at least three responses." onSelect={selectProgram} selected={program} />
      </section>

      <section className="tracer-responses-panel" aria-labelledby="tracer-responses-title">
        <header>
          <div>
            <p className="tracer-section-kicker">Detailed records</p>
            <h2 id="tracer-responses-title">Alumni responses</h2>
            <p>Search by name, email, program, employer, or job title.</p>
          </div>
          <span className="tracer-results-count">{total} {total === 1 ? 'response' : 'responses'}</span>
        </header>

        <form className="tracer-search" onSubmit={submitSearch}>
          <label className="tracer-search-input">
            <span>Search alumni</span>
            <input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Name, program, employer…" aria-label="Search alumni outcomes" />
          </label>
          <label className="tracer-country-filter">
            <span>Country</span>
            <select value={country} onChange={event => selectCountry(event.target.value)} aria-label="Filter by country">
              <option value="">All reportable countries</option>
              {countries.map(item => <option value={item.value} key={item.value}>{countryName(item.value)}</option>)}
            </select>
          </label>
          <label className="tracer-department-filter">
            <span>Department / college</span>
            <select value={department} onChange={event => selectDepartment(event.target.value)} aria-label="Filter by department or college">
              <option value="">All departments</option>
              {departmentOptions.map(item => <option value={item} key={item}>{item === 'Unspecified' ? 'Department not recorded' : item}</option>)}
            </select>
          </label>
          <label className="tracer-program-filter">
            <span>Program</span>
            <select value={program} onChange={event => selectProgram(event.target.value)} disabled={!department} aria-label="Filter by program">
              <option value="">{department ? 'All programs in department' : 'Select department first'}</option>
              {programs.map(item => <option value={item} key={item}>{item}</option>)}
              {program && !programs.includes(program) && <option value={program}>{program}</option>}
            </select>
          </label>
          <button type="submit" className="tracer-search-submit">Search</button>
          {hasFilters && <button type="button" className="tracer-clear-filters" onClick={clearFilters}>Clear filters</button>}
        </form>

        {hasFilters && <p className="tracer-active-filters">Showing filtered results{country ? ` in ${countryName(country)}` : ''}{department ? ` · ${department}` : ''}{program ? ` · ${program}` : ''}{search ? ` · matching “${search}”` : ''}</p>}

        {loading ? <p className="tracer-empty" role="status">Loading alumni responses…</p> : responses.length === 0 ? (
          <div className="tracer-empty-state"><span aria-hidden="true">⌕</span><strong>No responses found</strong><p>Try another name or clear the selected filters.</p></div>
        ) : (
          <>
            <p className="tracer-table-count">Showing <strong>{firstResult}–{lastResult}</strong> of <strong>{total}</strong> responses</p>
            <div className="tracer-table-wrap">
              <table>
                <thead><tr><th scope="col">Alumnus</th><th scope="col">Program</th><th scope="col">Status</th><th scope="col">Location</th><th scope="col">Work / study</th><th scope="col">Updated</th></tr></thead>
                <tbody>{responses.map(row => {
                  const workDetails = [row.tracer_employer, row.tracer_industry, label(row.tracer_employment_type || ''), row.tracer_degree_related == null ? '' : row.tracer_degree_related ? 'Degree-related' : 'Not degree-related', row.tracer_study_institution].filter(Boolean).join(' · ');
                  return <tr key={row.user_id}>
                    <td data-label="Alumnus" className="tracer-alumnus-cell"><strong>{[row.first_name, row.last_name].filter(Boolean).join(' ') || 'Alumnus'}</strong><small>{row.email}</small></td>
                    <td data-label="Program"><strong>{row.program || 'Not provided'}</strong><small>{[row.degree, row.department && row.department !== 'Unspecified' ? row.department : departmentForCourse(row.program) || 'Department not recorded', row.graduation_year ? `Class of ${row.graduation_year}` : ''].filter(Boolean).join(' · ')}</small></td>
                    <td data-label="Status"><span className={`tracer-status-pill status-${String(row.tracer_status || 'other').replaceAll('_', '-')}`}>{label(row.tracer_status)}</span></td>
                    <td data-label="Location" className="tracer-location-cell"><strong>{countryName(row.tracer_country) || 'Not provided'}</strong><small>{[row.tracer_region, row.tracer_city].filter(Boolean).join(' · ') || 'City or region not provided'}</small></td>
                    <td data-label="Work / study" className="tracer-work-cell"><strong>{row.tracer_job_title || row.tracer_study_program || 'Not provided'}</strong><small>{workDetails || (row.tracer_study_institution ? `Institution: ${row.tracer_study_institution}` : 'Additional details not provided')}</small></td>
                    <td data-label="Updated" className="tracer-updated-cell">{dateLabel(row.tracer_submitted_at)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          </>
        )}

        <footer className="tracer-pagination">
          <span>Page {page} of {maxPage}</span>
          <div><button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><button disabled={page >= maxPage || loading} onClick={() => setPage(value => value + 1)}>Next</button></div>
        </footer>
      </section>

      <p className="tracer-privacy-note"><span aria-hidden="true">⌑</span> Country, status, and program summaries hide groups smaller than three people. Individual responses are available only to staff with verification access.</p>
    </main>
  );
}
