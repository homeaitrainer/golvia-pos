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
        <input placeholder="Search by name, phone or email" value={search}
          onChange={e => { setSearch(e.target.value); load(e.target.value); }}
          style={{ width: '100%', marginBottom: 12 }} />
        {customers.length > 0 && (
          <table>
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Tier</th><th>Coins</th><th></th></tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id}>
                  <td><Link to={`/customers/${c.id}`}>{c.name}</Link></td>
                  <td className="golvia-num">{c.phone}</td>
                  <td><span className="golvia-badge">{c.membership.tier}</span></td>
                  <td className="golvia-num">{c.membership.current_coin_balance}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={`/customers/${c.id}`}>View &amp; edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {customers.length === 0 && <p className="golvia-empty">No customers found.</p>}
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Add customer</h3>
        <div className="golvia-field"><label htmlFor="customer-name">Name</label><input id="customer-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field"><label htmlFor="customer-phone">Phone</label><input id="customer-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field"><label htmlFor="customer-email">Email</label><input id="customer-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field"><label htmlFor="customer-birthday">Birthday</label><input id="customer-birthday" type="date" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} /></div>
        <div className="golvia-field"><label htmlFor="customer-state">State</label><input id="customer-state" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field">
          <label htmlFor="customer-gender">Gender</label>
          <select id="customer-gender" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
            <option value="">Unspecified</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="golvia-field"><label htmlFor="customer-notes">Notes</label><textarea id="customer-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: '100%' }} /></div>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <input type="checkbox" checked={form.whatsapp_consent} onChange={e => setForm({ ...form, whatsapp_consent: e.target.checked })} /> WhatsApp consent
        </label>
        <button className="golvia-btn-primary" onClick={createCustomer}>Create</button>
      </div>
    </div>
  );
}
