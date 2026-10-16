import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase.js';
import { COUNTRY_OPTIONS } from '../../data/countries.js';
import { ACADEMIC_PROGRAMS, DEPARTMENTS, departmentForCourse } from '../../data/academics.js';
import './Profile.css';

const statusCopy = {
  pending: [
    'Under review',
    'Your graduation evidence has been submitted and is awaiting review.'
  ],
  needs_information: [
    'More information needed',
    'Please submit a new graduation record with the details requested by the reviewer.'
  ],
  verified: [
    'Verified alumnus',
    'Your alumni status is confirmed. You can now use verified alumni features.'
  ],
  rejected: [
    'Unable to verify',
    'Your submission could not be confirmed. You may submit a new graduation record.'
  ]
};

const PH_LOCATIONS_API = 'https://psgc.cloud/api/v2';
const WORLD_LOCATIONS_API = 'https://countriesnow.space/v2';

async function fetchWorldLocations(urls, signal) {
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Location service returned ${response.status}`);
      const result = await response.json();
      if (result.error) throw new Error(result.message || result.error);
      const list = result.data || result.items || result.results || result;
      const items = Array.isArray(list) ? list : list?.subdivisions || list?.states || list?.cities || list?.items;
      if (Array.isArray(items)) return items;
      throw new Error('Location service returned an unsupported response');
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
    }
  }
  throw lastError || new Error('Location service unavailable');
}

function locationName(value) {
  return typeof value === 'string' ? value : value?.name || '';
}

function TracerLocationFields({ form, onChange, provinces, localities, regions, cities, loading, error }) {
  const isPhilippines = form.tracerCountry === 'PH';
  const regionOptions = isPhilippines ? [...provinces.map(item => item.name), 'Metro Manila'] : regions.map(item => item.name);
  const selectedProvince = provinces.find(item => item.name === form.tracerRegion);
  const philippineCities = localities.filter(item => {
    const province = locationName(item.province);
    const region = locationName(item.region);
    if (form.tracerRegion === 'Metro Manila') return /national capital region|^ncr$/i.test(region);
    return province === form.tracerRegion || Boolean(selectedProvince && !province && region === locationName(selectedProvince.region));
  });

  return <>
    <label>Region / province (optional)
      {regionOptions.length ? <select name="tracerRegion" value={form.tracerRegion} onChange={onChange}>
        <option value="">Select a {isPhilippines ? 'province' : 'region / state'}</option>
        {regionOptions.map(region => <option key={region} value={region}>{region}</option>)}
        {form.tracerRegion && !regionOptions.includes(form.tracerRegion) && <option value={form.tracerRegion}>{form.tracerRegion}</option>}
      </select> : <input name="tracerRegion" value={form.tracerRegion} onChange={onChange} maxLength="120" />}
    </label>
    <label>City (optional)
      {(isPhilippines ? philippineCities.length : cities.length) ? <select name="tracerCity" value={form.tracerCity} onChange={onChange} disabled={!form.tracerRegion}>
        <option value="">{form.tracerRegion ? 'Select a city or municipality' : 'Select a region first'}</option>
        {(isPhilippines ? philippineCities.map(item => item.name) : cities).map((city, index) => <option key={`${city}-${index}`} value={city}>{city}</option>)}
        {form.tracerCity && !(isPhilippines ? philippineCities.some(item => item.name === form.tracerCity) : cities.includes(form.tracerCity)) && <option value={form.tracerCity}>{form.tracerCity}</option>}
      </select> : <input name="tracerCity" value={form.tracerCity} onChange={onChange} maxLength="120" />}
    </label>
    {loading && <small className="tracer-location-help">Loading {isPhilippines ? 'Philippine' : 'country'} region and city lists…</small>}
    {error && <small className="tracer-location-help" role="status">Location list unavailable. You can enter the location manually.</small>}
  </>;
}

function toIsoDate(value) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);

  return Number.isNaN(date.getTime()) ||
    date.getDate() !== Number(day) ||
    date.getMonth() !== Number(month) - 1
    ? null
    : `${year}-${month}-${day}`;
}

export default function Profile({ user, onStatusChange }) {
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [philippineProvinces, setPhilippineProvinces] = useState([]);
  const [philippineLocalities, setPhilippineLocalities] = useState([]);
  const [worldRegions, setWorldRegions] = useState([]);
  const [worldCities, setWorldCities] = useState([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(false);

  const [form, setForm] = useState({
    graduationName: '',
    graduationDate: '',
    batchName: '',
    program: '',
    department: '',
    document: null,
    tracerStatus: '',
    tracerCountry: '',
    tracerRegion: '',
    tracerCity: '',
    tracerEmployer: '',
    tracerJobTitle: '',
    tracerIndustry: '',
    tracerEmploymentType: '',
    tracerDegreeRelated: '',
    tracerStudyProgram: '',
    tracerStudyInstitution: '',
    tracerConsent: false,
  });

  async function loadVerification() {
    setLoading(true);

    const { data, error } = await supabase
      .from('alumni_verifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setMessage(
        'Verification setup is unavailable. Run the updated Supabase schema, then refresh this page.'
      );
    } else {
      setVerification(data);
      setForm(current => ({
        ...current,
        tracerStatus: data?.tracer_status || '',
        program: data?.program || '',
        department: departmentForCourse(data?.program || ''),
        tracerCountry: data?.tracer_country || '',
        tracerRegion: data?.tracer_region || '',
        tracerCity: data?.tracer_city || '',
        tracerEmployer: data?.tracer_employer || '',
        tracerJobTitle: data?.tracer_job_title || '',
        tracerIndustry: data?.tracer_industry || '',
        tracerEmploymentType: data?.tracer_employment_type || '',
        tracerDegreeRelated: data?.tracer_degree_related == null ? '' : data.tracer_degree_related ? 'yes' : 'no',
        tracerStudyProgram: data?.tracer_study_program || '',
        tracerStudyInstitution: data?.tracer_study_institution || '',
        tracerConsent: Boolean(data?.tracer_consent),
      }));
      onStatusChange?.(data);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadVerification();
  }, [user.id]);

  useEffect(() => {
    if (form.tracerCountry !== 'PH' || philippineProvinces.length) return;
    const controller = new AbortController();
    setLocationLoading(true);
    setLocationError(false);
    Promise.all([
      fetch(`${PH_LOCATIONS_API}/provinces`, { signal: controller.signal }),
      fetch(`${PH_LOCATIONS_API}/cities-municipalities`, { signal: controller.signal }),
    ]).then(async ([provinceResponse, localityResponse]) => {
      if (!provinceResponse.ok || !localityResponse.ok) throw new Error('Location data could not be loaded');
      const [provinceData, localityData] = await Promise.all([provinceResponse.json(), localityResponse.json()]);
      setPhilippineProvinces(Array.isArray(provinceData) ? provinceData : provinceData.data || []);
      setPhilippineLocalities(Array.isArray(localityData) ? localityData : localityData.data || []);
    }).catch(error => {
      if (error.name !== 'AbortError') setLocationError(true);
    }).finally(() => setLocationLoading(false));
    return () => controller.abort();
  }, [form.tracerCountry, philippineProvinces.length]);

  useEffect(() => {
    if (!form.tracerCountry || form.tracerCountry === 'PH') {
      setWorldRegions([]);
      setWorldCities([]);
      return;
    }
    const controller = new AbortController();
    setLocationLoading(true);
    setLocationError(false);
    setWorldRegions([]);
    setWorldCities([]);
    const countryName = COUNTRY_OPTIONS.find(country => country.code === form.tracerCountry)?.name || form.tracerCountry;
    const legacyQuery = new URLSearchParams({ country: countryName });
    fetchWorldLocations([
      `${WORLD_LOCATIONS_API}/countries/${encodeURIComponent(form.tracerCountry)}/subdivisions?limit=1000`,
      `https://countriesnow.space/api/v0.1/countries/states/q?${legacyQuery}`,
    ], controller.signal).then(items => {
      setWorldRegions(items.map(item => ({
        name: item.name || item.label || item.subdivision,
        ref: item.iso3166_2 || item.code || item.key || item.id || item.name,
      })).filter(item => item.name && item.ref).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(error => {
      if (error.name !== 'AbortError') setLocationError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLocationLoading(false);
    });
    return () => controller.abort();
  }, [form.tracerCountry]);

  useEffect(() => {
    if (!form.tracerCountry || form.tracerCountry === 'PH' || !form.tracerRegion) {
      setWorldCities([]);
      return;
    }
    const controller = new AbortController();
    setLocationLoading(true);
    setLocationError(false);
    const selectedRegion = worldRegions.find(region => region.name === form.tracerRegion);
    const subdivisionRef = selectedRegion?.ref || form.tracerRegion;
    const countryName = COUNTRY_OPTIONS.find(country => country.code === form.tracerCountry)?.name || form.tracerCountry;
    const legacyQuery = new URLSearchParams({ country: countryName, state: form.tracerRegion });
    fetchWorldLocations([
      `${WORLD_LOCATIONS_API}/subdivisions/${encodeURIComponent(subdivisionRef)}/cities?limit=1000`,
      `https://countriesnow.space/api/v0.1/countries/state/cities/q?${legacyQuery}`,
    ], controller.signal).then(items => {
      setWorldCities([...new Set(items.map(city => typeof city === 'string' ? city : city.name || city.label).filter(city => typeof city === 'string' && city.trim()))].sort((a, b) => a.localeCompare(b)));
    }).catch(error => {
      if (error.name !== 'AbortError') setLocationError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLocationLoading(false);
    });
    return () => controller.abort();
  }, [form.tracerCountry, form.tracerRegion, worldRegions]);

  function updateField(event) {
    const { name, value, files } = event.target;

    setForm((current) => ({
      ...current,
      [name]: files ? files[0] : value,
      ...(name === 'department' ? { program: '' } : {}),
    }));
  }

  function updateTracerLocation(event) {
    const { name, value } = event.target;
    setForm(current => ({
      ...current,
      [name]: value,
      ...(name === 'tracerCountry' ? { tracerRegion: '', tracerCity: '' } : {}),
      ...(name === 'tracerRegion' ? { tracerCity: '' } : {}),
    }));
  }

  function formatGraduationDate(event) {
    const digits = event.target.value
      .replace(/\D/g, '')
      .slice(0, 8);

    setForm((current) => ({
      ...current,
      graduationDate: [
        digits.slice(0, 2),
        digits.slice(2, 4),
        digits.slice(4, 8)
      ]
        .filter(Boolean)
        .join('/')
    }));
  }

  async function submit(event) {
    event.preventDefault();

    const graduationDate = toIsoDate(form.graduationDate);
    const file = form.document;

    if (!graduationDate) {
      return setMessage(
        'Enter a valid graduation date in DD/MM/YYYY format.'
      );
    }

    if (!file) {
      return setMessage(
        'Please attach a graduation certificate, transcript, or alumni record.'
      );
    }

    if (
      !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      return setMessage(
        'Use a PDF, JPG, or PNG file no larger than 10 MB.'
      );
    }

    setSubmitting(true);
    setMessage('');

    const path = `${user.id}/${crypto.randomUUID()}.${file.name
      .split('.')
      .pop()
      .toLowerCase()}`;

    const { error: uploadError } = await supabase.storage
      .from('verification-documents')
      .upload(path, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      setMessage(uploadError.message);
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase
      .from('alumni_verifications')
      .insert({
        user_id: user.id,
        graduation_name: form.graduationName.trim(),
        graduation_date: graduationDate,
        graduation_year: Number(graduationDate.slice(0, 4)),
        batch_name: form.batchName.trim(),
        program: form.program.trim(),
        document_path: path,
        document_filename: file.name,
        tracer_status: form.tracerStatus,
        tracer_country: form.tracerCountry.trim(),
        tracer_region: form.tracerRegion.trim() || null,
        tracer_city: form.tracerCity.trim() || null,
        tracer_employer: form.tracerEmployer.trim() || null,
        tracer_job_title: form.tracerJobTitle.trim() || null,
        tracer_industry: form.tracerIndustry.trim() || null,
        tracer_employment_type: form.tracerEmploymentType || null,
        tracer_degree_related: form.tracerDegreeRelated === '' ? null : form.tracerDegreeRelated === 'yes',
        tracer_study_program: form.tracerStudyProgram.trim() || null,
        tracer_study_institution: form.tracerStudyInstitution.trim() || null,
        tracer_consent: form.tracerConsent,
      });

    if (insertError) {
      await supabase.storage
        .from('verification-documents')
        .remove([path]);

      setMessage(insertError.message);
      setSubmitting(false);
      return;
    }

    setForm({
      graduationName: '',
      graduationDate: '',
      batchName: '',
      program: '',
      department: '',
      document: null,
      tracerStatus: '', tracerCountry: '', tracerRegion: '', tracerCity: '',
      tracerEmployer: '', tracerJobTitle: '', tracerIndustry: '', tracerEmploymentType: '',
      tracerDegreeRelated: '', tracerStudyProgram: '', tracerStudyInstitution: '', tracerConsent: false,
    });

    setMessage(
      'Your graduation evidence was submitted for review.'
    );

    await loadVerification();
    setSubmitting(false);
  }

  async function submitTracerUpdate(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    const { error } = await supabase.rpc('update_own_tracer_study', {
      p_status: form.tracerStatus,
      p_country: form.tracerCountry.trim(),
      p_region: form.tracerRegion.trim() || null,
      p_city: form.tracerCity.trim() || null,
      p_employer: form.tracerEmployer.trim() || null,
      p_job_title: form.tracerJobTitle.trim() || null,
      p_industry: form.tracerIndustry.trim() || null,
      p_employment_type: form.tracerEmploymentType || null,
      p_degree_related: form.tracerDegreeRelated === '' ? null : form.tracerDegreeRelated === 'yes',
      p_study_program: form.tracerStudyProgram.trim() || null,
      p_study_institution: form.tracerStudyInstitution.trim() || null,
      p_consent: form.tracerConsent,
    });
    if (error) {
      setMessage(error.message || 'Your tracer details could not be updated. Please try again.');
      setSubmitting(false);
      return;
    }
    setMessage('Your tracer study information was updated.');
    await loadVerification();
    setSubmitting(false);
  }

  const currentStatus = verification
    ? statusCopy[verification.status]
    : null;

  const canSubmit =
    !verification ||
    ['needs_information', 'rejected'].includes(verification.status);

  return (
    <section className="profile-page">
      <header className="profile-heading">
        <p className="eyebrow green">My account</p>
        <h1>My profile</h1>
        <p>{user.email}</p>
      </header>

      <section
        className={`verification-status ${
          verification?.status || 'not-started'
        }`}
      >
        <div>
          <p className="eyebrow green">Alumni verification</p>

          <h2>
            {loading
              ? 'Checking verification status…'
              : currentStatus?.[0] || 'Verify your alumni status'}
          </h2>

          <p>
            {loading
              ? ''
              : currentStatus?.[1] ||
                'Submit your graduation details to appear in the alumni directory and receive a verified alumni badge.'}
          </p>

          {verification?.reviewer_note && (
            <p className="reviewer-feedback">
              <strong>Reviewer note:</strong>{' '}
              {verification.reviewer_note}
            </p>
          )}
        </div>

        <span className="verification-badge">
          {verification?.status === 'verified'
            ? '✓ Verified'
            : verification?.status?.replace('_', ' ') || 'Not started'}
        </span>
      </section>

      {canSubmit && !loading && (
        <form className="verification-form" onSubmit={submit}>
          <div>
            <p className="eyebrow green">Graduation details</p>

            <h2>
              {verification
                ? 'Submit updated evidence'
                : 'Start verification'}
            </h2>

            <p>
              We only use graduation evidence to verify alumni status. Do
              not upload any government or personal ID.
            </p>
          </div>

          <label>
            Name used while studying
            <input
              name="graduationName"
              value={form.graduationName}
              onChange={updateField}
              required
            />
          </label>

          <div className="verification-fields">
            <label>
              Graduation date
              <input
                name="graduationDate"
                type="text"
                inputMode="numeric"
                placeholder="00/00/0000"
                value={form.graduationDate}
                onChange={formatGraduationDate}
                maxLength="10"
                required
              />
            </label>

            <label>
              Batch name
              <input
                name="batchName"
                placeholder="e.g. Batch 2020"
                value={form.batchName}
                onChange={updateField}
                required
              />
            </label>

            <label>Department / College
              <select name="department" value={form.department} onChange={updateField} required>
                <option value="">Select your college</option>
                {DEPARTMENTS.map(department => <option key={department} value={department}>{department}</option>)}
              </select>
            </label>

            <label>Course / Program
              <select name="program" value={form.program} onChange={updateField} disabled={!form.department} required>
                <option value="">{form.department ? 'Select your course' : 'Select a college first'}</option>
                {(ACADEMIC_PROGRAMS[form.department] || []).map(course => <option key={course} value={course}>{course}</option>)}
                {form.program && !ACADEMIC_PROGRAMS[form.department]?.includes(form.program) && <option value={form.program}>{form.program} (existing record)</option>}
              </select>
            </label>
          </div>

          <section className="tracer-form-section" aria-labelledby="tracer-study-title">
            <div>
              <p className="eyebrow green">Graduate tracer study</p>
              <h2 id="tracer-study-title">Your current status</h2>
              <p>These self-reported details help the university understand alumni employment and further-study outcomes.</p>
            </div>

            <div className="verification-fields">
              <label>Current status
                <select name="tracerStatus" value={form.tracerStatus} onChange={updateField} required>
                  <option value="">Select your status</option>
                  <option value="employed">Employed</option>
                  <option value="self_employed">Self-employed</option>
                  <option value="further_studies">Further studies</option>
                  <option value="seeking_work">Seeking work</option>
                  <option value="not_seeking">Not currently seeking work</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>Current country
                <select name="tracerCountry" value={form.tracerCountry} onChange={updateTracerLocation} required>
                  <option value="">Select a country</option>
                  {COUNTRY_OPTIONS.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
                </select>
              </label>
              <TracerLocationFields form={form} onChange={updateTracerLocation} provinces={philippineProvinces} localities={philippineLocalities} regions={worldRegions} cities={worldCities} loading={locationLoading} error={locationError} />
            </div>

            {['employed', 'self_employed'].includes(form.tracerStatus) && <div className="verification-fields">
              <label>Employer / business (optional)
                <input name="tracerEmployer" value={form.tracerEmployer} onChange={updateField} maxLength="160" />
              </label>
              <label>Job title (optional)
                <input name="tracerJobTitle" value={form.tracerJobTitle} onChange={updateField} maxLength="160" />
              </label>
              <label>Industry (optional)
                <input name="tracerIndustry" value={form.tracerIndustry} onChange={updateField} maxLength="120" placeholder="e.g. Education, Healthcare, IT" />
              </label>
              <label>Employment type (optional)
                <select name="tracerEmploymentType" value={form.tracerEmploymentType} onChange={updateField}>
                  <option value="">Prefer not to say</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="temporary">Temporary</option><option value="freelance">Freelance</option><option value="internship">Internship</option><option value="other">Other</option>
                </select>
              </label>
              <label>Is your work related to your degree?
                <select name="tracerDegreeRelated" value={form.tracerDegreeRelated} onChange={updateField}>
                  <option value="">Prefer not to say</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </label>
            </div>}

            {form.tracerStatus === 'further_studies' && <div className="verification-fields">
              <label>Program / course (optional)<input name="tracerStudyProgram" value={form.tracerStudyProgram} onChange={updateField} maxLength="160" /></label>
              <label>Institution (optional)<input name="tracerStudyInstitution" value={form.tracerStudyInstitution} onChange={updateField} maxLength="160" /></label>
            </div>}

            <label className="tracer-consent">
              <input type="checkbox" checked={form.tracerConsent} onChange={event => setForm(current => ({ ...current, tracerConsent: event.target.checked }))} required />
              <span>I agree that NDDU may use these details for alumni outcome reporting. Authorized staff may view my individual response; reports will show grouped statistics.</span>
            </label>
          </section>

          <label>
            Graduation evidence
            <small>
              Degree certificate, transcript, or official alumni record ·
              PDF, JPG, or PNG · maximum 10 MB
            </small>

            <input
              name="document"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={updateField}
              required
            />
          </label>

          {message && (
            <p className="verification-message">{message}</p>
          )}

          <button className="dark-button" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for verification'}
          </button>
        </form>
      )}

      {verification?.status === 'verified' && !loading && (
        <form id="tracer-study-update" className="verification-form" onSubmit={submitTracerUpdate}>
          <div>
            <p className="eyebrow green">Graduate tracer study</p>
            <h2>Update your current status</h2>
            <p>Update these details when your work, study, or location changes. Your graduation verification remains unchanged.</p>
          </div>
          <div className="tracer-form-section">
            <div className="verification-fields">
              <label>Current status<select name="tracerStatus" value={form.tracerStatus} onChange={updateField} required><option value="">Select your status</option><option value="employed">Employed</option><option value="self_employed">Self-employed</option><option value="further_studies">Further studies</option><option value="seeking_work">Seeking work</option><option value="not_seeking">Not currently seeking work</option><option value="other">Other</option></select></label>
              <label>Current country<select name="tracerCountry" value={form.tracerCountry} onChange={updateTracerLocation} required><option value="">Select a country</option>{COUNTRY_OPTIONS.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
              <TracerLocationFields form={form} onChange={updateTracerLocation} provinces={philippineProvinces} localities={philippineLocalities} loading={locationLoading} error={locationError} />
            </div>
            {['employed', 'self_employed'].includes(form.tracerStatus) && <div className="verification-fields">
              <label>Employer / business (optional)<input name="tracerEmployer" value={form.tracerEmployer} onChange={updateField} maxLength="160" /></label>
              <label>Job title (optional)<input name="tracerJobTitle" value={form.tracerJobTitle} onChange={updateField} maxLength="160" /></label>
              <label>Industry (optional)<input name="tracerIndustry" value={form.tracerIndustry} onChange={updateField} maxLength="120" /></label>
              <label>Employment type<select name="tracerEmploymentType" value={form.tracerEmploymentType} onChange={updateField}><option value="">Prefer not to say</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="temporary">Temporary</option><option value="freelance">Freelance</option><option value="internship">Internship</option><option value="other">Other</option></select></label>
              <label>Work related to your degree?<select name="tracerDegreeRelated" value={form.tracerDegreeRelated} onChange={updateField}><option value="">Prefer not to say</option><option value="yes">Yes</option><option value="no">No</option></select></label>
            </div>}
            {form.tracerStatus === 'further_studies' && <div className="verification-fields"><label>Program / course<input name="tracerStudyProgram" value={form.tracerStudyProgram} onChange={updateField} maxLength="160" /></label><label>Institution<input name="tracerStudyInstitution" value={form.tracerStudyInstitution} onChange={updateField} maxLength="160" /></label></div>}
            <label className="tracer-consent"><input type="checkbox" checked={form.tracerConsent} onChange={event => setForm(current => ({ ...current, tracerConsent: event.target.checked }))} required /><span>I agree that NDDU may use these details for alumni outcome reporting. Authorized staff may view my individual response; reports show grouped statistics.</span></label>
          </div>
          {message && <p className="verification-message">{message}</p>}
          <button className="dark-button" disabled={submitting}>{submitting ? 'Updating…' : 'Update tracer information'}</button>
        </form>
      )}

      {message && !canSubmit && (
        <p className="verification-message">{message}</p>
      )}
    </section>
  );
}
