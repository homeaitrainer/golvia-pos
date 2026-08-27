import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', whatsapp_consent: false });

  async function load(q = '') {
    setCustomers(await apiClient.get(`/customers${q ? `?search=${encodeURIComponent(q)}` : ''}`));
  }
  useEffect(() => { load(); }, []);

  async function createCustomer() {
    await apiClient.post('/customers', form);
    setForm({ name: '', phone: '', email: '', whatsapp_consent: false });
    load();
  }

  return (
    <div>
      <h2>Customers</h2>
      <input placeholder="Search" value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }} />
      <ul>
        {customers.map(c => (
          <li key={c.id}><Link to={`/customers/${c.id}`}>{c.name} — {c.phone} ({c.membership.tier})</Link></li>
        ))}
      </ul>

      <h3>Add customer</h3>
      <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
      <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      <label><input type="checkbox" checked={form.whatsapp_consent} onChange={e => setForm({ ...form, whatsapp_consent: e.target.checked })} /> WhatsApp consent</label>
      <button onClick={createCustomer}>Create</button>
    </div>
  );
}
