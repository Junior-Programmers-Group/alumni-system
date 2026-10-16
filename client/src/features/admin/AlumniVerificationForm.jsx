import { useState } from 'react';
import { supabase } from '../../services/supabase.js';
import { COUNTRY_OPTIONS } from '../../data/countries.js';
import { BACHELOR_PROGRAMS, DEPARTMENTS } from '../../data/academics.js';

export default function AlumniVerificationForm({ onComplete }) {
  const [form, setForm] = useState({
    graduationName: '',
    graduationYear: '',
    graduationDate: '',
    batchName: '',
    program: '',
    department: '',
    tracerStatus: '',
    tracerCountry: '',
    tracerConsent: false,
  });

  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function handleChange(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
      ...(event.target.name === 'department' ? { program: '' } : {}),
    }));
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    setDocument(file);
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        throw new Error('Please sign in before submitting your alumni verification.');
      }

      if (!document) {
        throw new Error('Please upload your graduation document.');
      }

      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
      ];

      if (!allowedTypes.includes(document.type)) {
        throw new Error('Please upload a PDF, JPG, or PNG file.');
      }

      const maxSize = 5 * 1024 * 1024;

      if (document.size > maxSize) {
        throw new Error('The graduation document must be 5 MB or smaller.');
      }

      const fileExtension =
        document.name.split('.').pop()?.toLowerCase() || 'pdf';

      const filePath = `${user.id}/${crypto.randomUUID()}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('verification-documents')
        .upload(filePath, document, {
          contentType: document.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: verificationError } = await supabase
        .from('alumni_verifications')
        .insert({
          user_id: user.id,
          graduation_name: form.graduationName.trim(),
          graduation_year: Number(form.graduationYear),
          graduation_date: form.graduationDate || null,
          batch_name: form.batchName.trim() || null,
          program: form.program.trim(),
          document_path: filePath,
          document_filename: document.name,
          status: 'pending',
          tracer_status: form.tracerStatus,
          tracer_country: form.tracerCountry.trim(),
          tracer_consent: form.tracerConsent,
        });

      if (verificationError) {
        await supabase.storage
          .from('verification-documents')
          .remove([filePath]);

        throw verificationError;
      }

      setMessage(
        'Your alumni verification has been submitted successfully. An administrator will review your information.'
      );

      setForm({
        graduationName: '',
        graduationYear: '',
        graduationDate: '',
        batchName: '',
        program: '',
        department: '',
        tracerStatus: '',
        tracerCountry: '',
        tracerConsent: false,
      });

      setDocument(null);

      if (onComplete) {
        onComplete();
      }
    } catch (requestError) {
      setError(requestError.message || 'Unable to submit verification.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="register-header">
          <p className="eyebrow green">NDDU ALUMNI</p>

          <h1>Complete your alumni profile</h1>

          <p>
            Provide your graduation information and supporting document.
            An administrator will review your submission before your alumni
            account is verified.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="register-form">
          <label>
            Name on Graduation Record
            <input
              type="text"
              name="graduationName"
              value={form.graduationName}
              onChange={handleChange}
              placeholder="Juan Dela Cruz"
              required
            />
          </label>

          <label>
            Department / College
            <select name="department" value={form.department} onChange={handleChange} required>
              <option value="">Select your college</option>
              {DEPARTMENTS.map(department => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>

          <label>
            Program / Course
            <select name="program" value={form.program} onChange={handleChange} disabled={!form.department} required>
              <option value="">{form.department ? 'Select your program' : 'Select a college first'}</option>
              {(BACHELOR_PROGRAMS[form.department] || []).map(program => <option key={program} value={program}>{program}</option>)}
            </select>
          </label>

          <div>
            <label>
              Graduation Year
              <input
                type="number"
                name="graduationYear"
                value={form.graduationYear}
                onChange={handleChange}
                min="1900"
                max="2100"
                placeholder="2026"
                required
              />
            </label>

            <label>
              Graduation Date
              <input
                type="date"
                name="graduationDate"
                value={form.graduationDate}
                onChange={handleChange}
              />
            </label>
          </div>

          <label>
            Batch Name
            <input
              type="text"
              name="batchName"
              value={form.batchName}
              onChange={handleChange}
              placeholder="Batch 2026"
            />
          </label>

          <fieldset className="verification-form">
            <legend>Graduate tracer study</legend>
            <label>Current status
              <select name="tracerStatus" value={form.tracerStatus} onChange={handleChange} required>
                <option value="">Select your status</option><option value="employed">Employed</option><option value="self_employed">Self-employed</option><option value="further_studies">Further studies</option><option value="seeking_work">Seeking work</option><option value="not_seeking">Not currently seeking work</option><option value="other">Other</option>
              </select>
            </label>
            <label>Current country<select name="tracerCountry" value={form.tracerCountry} onChange={handleChange} required><option value="">Select a country</option>{COUNTRY_OPTIONS.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
            <label><input type="checkbox" checked={form.tracerConsent} onChange={event => setForm(current => ({ ...current, tracerConsent: event.target.checked }))} required /> I agree to alumni outcome reporting and understand authorized staff can view my response.</label>
          </fieldset>

          <label>
            Graduation Evidence
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              required
            />

            <small>
              Upload your diploma, certificate of graduation, or other
              approved graduation evidence. Maximum 5 MB.
            </small>
          </label>

          {error && <p className="form-error">{error}</p>}

          {message && <p className="form-success">{message}</p>}

          <button
            type="submit"
            className="dark-button register-button"
            disabled={loading}
          >
            {loading
              ? 'Submitting verification…'
              : 'Submit for Verification'}
          </button>
        </form>
      </section>
    </main>
  );
}
