import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

function toEditForm(customer) {
  return {
    name: customer.name || '',
    email: customer.email || '',
    whatsapp_consent: !!customer.whatsapp_consent,
    birthday: customer.birthday || '',
    state: customer.state || '',
    gender: customer.gender || '',
    notes: customer.notes || '',
  };
}

export default function CustomerProfile() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  function load() {
    return apiClient.get(`/customers/${id}`).then(setCustomer);
  }

  useEffect(() => { load(); }, [id]);

  if (!customer) return <p>Loading...</p>;

  function startEditing() {
    setForm(toEditForm(customer));
    setEditing(true);
  }

  async function save() {
    await apiClient.put(`/customers/${id}`, form);
    await load();
    setEditing(false);
  }

  return (
    <div>
      <h2>{customer.name}</h2>
      <p>Phone: {customer.phone} | Email: {customer.email}</p>
      <p>Tier: {customer.membership.tier} | Lifetime coins: {customer.membership.lifetime_coins} | Balance: {customer.membership.current_coin_balance}</p>
      <p>Birthday: {customer.birthday || '—'} | State: {customer.state || '—'} | Gender: {customer.gender || '—'}</p>
      <p>WhatsApp consent: {customer.whatsapp_consent ? 'Yes' : 'No'}</p>
      <p>Notes: {customer.notes}</p>

      {!editing && <button onClick={startEditing}>Edit</button>}

      {editing && form && (
        <div>
          <h3>Edit customer</h3>
          <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <label>Birthday: <input type="date" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} /></label>
          <input placeholder="State" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
          <label>Gender:{' '}
            <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
              <option value="">Unspecified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <div><textarea placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <label><input type="checkbox" checked={form.whatsapp_consent} onChange={e => setForm({ ...form, whatsapp_consent: e.target.checked })} /> WhatsApp consent</label>
          <div>
            <button onClick={save}>Save</button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      <h3>Vouchers</h3>
      {customer.vouchers && customer.vouchers.length > 0 ? (
        <ul>
          {customer.vouchers.map(v => (
            <li key={v.id}>
              {v.type} — RM{v.value} off (min spend RM{v.min_spend})
              {v.expires_at ? ` — expires ${new Date(v.expires_at).toLocaleString()}` : ''}
            </li>
          ))}
        </ul>
      ) : <p>No usable vouchers.</p>}

      <h3>Purchase history</h3>
      <ul>{customer.invoices.map(i => <li key={i.id}>{i.invoice_number} — RM{i.total} — {i.status}</li>)}</ul>
    </div>
  );
}
