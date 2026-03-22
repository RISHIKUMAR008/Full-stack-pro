import { useState } from 'react';
import './App.css';

const initialForm = {
  name: '',
  age: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  hometown: '',
  phoneNumber: '',
  email: '',
  notes: '',
};

function App() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [savedList, setSavedList] = useState([]);

  const update = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: 'loading', message: 'Saving…' });

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          age: form.age,
          address: form.address,
          city: form.city,
          state: form.state,
          zipCode: form.zipCode,
          hometown: form.hometown,
          phoneNumber: form.phoneNumber,
          email: form.email,
          notes: form.notes,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          Array.isArray(data.errors) && data.errors.length
            ? data.errors.join('. ')
            : data.error || 'Could not save. Try again.';
        setStatus({ type: 'error', message: msg });
        return;
      }

      setStatus({ type: 'success', message: 'Saved successfully.' });
      setForm(initialForm);
      setSavedList((prev) => [data, ...prev]);
    } catch {
      setStatus({
        type: 'error',
        message:
          'Network error. Start the API (npm run server) and ensure the dev proxy is set.',
      });
    }
  };

  return (
    <div className="app">
      <main className="card">
        <h1 className="title">Contact profile</h1>
        <p className="subtitle">
          Enter your details below. They are sent to the backend and stored in a JSON file.
        </p>

        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Full name *</span>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={update('name')}
              autoComplete="name"
              required
            />
          </label>

          <label className="field">
            <span>Age *</span>
            <input
              type="number"
              name="age"
              min="0"
              max="150"
              value={form.age}
              onChange={update('age')}
              required
            />
          </label>

          <label className="field field--full">
            <span>Street address *</span>
            <input
              type="text"
              name="address"
              value={form.address}
              onChange={update('address')}
              autoComplete="street-address"
              required
            />
          </label>

          <div className="row">
            <label className="field">
              <span>City *</span>
              <input
                type="text"
                name="city"
                value={form.city}
                onChange={update('city')}
                autoComplete="address-level2"
                required
              />
            </label>
            <label className="field">
              <span>State / region</span>
              <input
                type="text"
                name="state"
                value={form.state}
                onChange={update('state')}
                autoComplete="address-level1"
              />
            </label>
            <label className="field">
              <span>ZIP / postal code</span>
              <input
                type="text"
                name="zipCode"
                value={form.zipCode}
                onChange={update('zipCode')}
                autoComplete="postal-code"
              />
            </label>
          </div>

          <label className="field">
            <span>Hometown *</span>
            <input
              type="text"
              name="hometown"
              value={form.hometown}
              onChange={update('hometown')}
              required
            />
          </label>

          <label className="field">
            <span>Phone number *</span>
            <input
              type="tel"
              name="phoneNumber"
              value={form.phoneNumber}
              onChange={update('phoneNumber')}
              autoComplete="tel"
              required
            />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
            />
          </label>

          <label className="field field--full">
            <span>Notes</span>
            <textarea
              name="notes"
              rows={3}
              value={form.notes}
              onChange={update('notes')}
            />
          </label>

          <div className="actions">
            <button type="submit" className="btn primary" disabled={status.type === 'loading'}>
              {status.type === 'loading' ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>

        {status.message ? (
          <p
            className={`feedback ${status.type === 'error' ? 'feedback--error' : ''} ${
              status.type === 'success' ? 'feedback--ok' : ''
            }`}
            role="status"
          >
            {status.message}
          </p>
        ) : null}

        {savedList.length > 0 ? (
          <section className="recent" aria-label="Recently saved in this session">
            <h2 className="recent-title">Saved this session</h2>
            <ul className="recent-list">
              {savedList.map((s) => (
                <li key={s.id} className="recent-item">
                  <strong>{s.name}</strong>
                  <span className="muted">
                    {' '}
                    · {s.city}, age {s.age}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
