import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    name: '', phone: '', email: '', whatsapp_consent: false,
    birthday: '', state: '', gender: '', notes: '',
  });

  async function load(q = '') {
    setCustomers(await apiClient.get(`/customers${q ? `?search=${encodeURIComponent(q)}` : ''}`));
  }
  useEffect(() => { load(); }, []);

  async function createCustomer() {
    await apiClient.post('/customers', form);
    setForm({ name: '', phone: '', email: '', whatsapp_consent: false, birthday: '', state: '', gender: '', notes: '' });
    load();
  }

  return (
    <div className="golvia-page">
      <h2>Customers</h2>

      <div className="golvia-card">
        <input placeholder="Search" value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }} style={{ width: '100%', marginBottom: 12 }} />
        {customers.map(c => (
          <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--golvia-border)' }}>
            <Link to={`/customers/${c.id}`}>{c.name}</Link> — {c.phone} <span className="golvia-badge">{c.membership.tier}</span>
          </div>
        ))}
        {customers.length === 0 && <p className="golvia-empty">No customers found.</p>}
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Add customer</h3>
        <div className="golvia-field"><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field"><label>Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field"><label>Birthday</label><input type="date" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} /></div>
        <div className="golvia-field"><label>State</label><input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field">
          <label>Gender</label>
          <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
            <option value="">Unspecified</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="golvia-field"><label>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: '100%' }} /></div>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <input type="checkbox" checked={form.whatsapp_consent} onChange={e => setForm({ ...form, whatsapp_consent: e.target.checked })} /> WhatsApp consent
        </label>
        <button className="golvia-btn-primary" onClick={createCustomer}>Create</button>
      </div>
    </div>
  );
}
