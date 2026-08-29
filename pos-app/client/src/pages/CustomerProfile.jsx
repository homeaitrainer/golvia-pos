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

  if (!customer) return <p className="golvia-page">Loading...</p>;

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
    <div className="golvia-page">
      <h2>{customer.name} <span className="golvia-badge">{customer.membership.tier}</span></h2>

      {/* Read and edit share one card: the Edit button sits in the card header where it is
          actually visible, and the fields change in place. Previously the button was the last
          thing under a wall of pipe-separated paragraphs, and editing opened a second card
          further down the page. */}
      {!editing && (
        <div className="golvia-card">
          <div className="golvia-card-head">
            <h3 style={{ margin: 0 }}>Details</h3>
            <button className="golvia-btn-primary" onClick={startEditing}>Edit details</button>
          </div>
          <dl className="golvia-kv">
            <dt>Phone</dt><dd className="golvia-num">{customer.phone}</dd>
            <dt>Email</dt><dd>{customer.email || '—'}</dd>
            <dt>Birthday</dt><dd>{customer.birthday || '—'}</dd>
            <dt>State</dt><dd>{customer.state || '—'}</dd>
            <dt>Gender</dt><dd>{customer.gender || '—'}</dd>
            <dt>WhatsApp</dt>
            <dd>{customer.whatsapp_consent
              ? <span className="golvia-badge">Consented</span>
              : <span style={{ color: 'var(--golvia-text-muted)' }}>Not consented</span>}</dd>
            <dt>Coins</dt>
            <dd className="golvia-num">
              {customer.membership.current_coin_balance} available
              <span style={{ color: 'var(--golvia-text-muted)' }}> · {customer.membership.lifetime_coins} lifetime</span>
            </dd>
            <dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{customer.notes || '—'}</dd>
          </dl>
        </div>
      )}

      {editing && form && (
        <div className="golvia-card">
          <div className="golvia-card-head">
            <h3 style={{ margin: 0 }}>Edit details</h3>
          </div>
          <div className="golvia-field"><label htmlFor="edit-customer-name">Name</label><input id="edit-customer-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label htmlFor="edit-customer-email">Email</label><input id="edit-customer-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label htmlFor="edit-customer-birthday">Birthday</label><input id="edit-customer-birthday" type="date" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} /></div>
          <div className="golvia-field"><label htmlFor="edit-customer-state">State</label><input id="edit-customer-state" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field">
            <label htmlFor="edit-customer-gender">Gender</label>
            <select id="edit-customer-gender" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
              <option value="">Unspecified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div className="golvia-field"><label htmlFor="edit-customer-notes">Notes</label><textarea id="edit-customer-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: '100%' }} /></div>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <input type="checkbox" checked={form.whatsapp_consent} onChange={e => setForm({ ...form, whatsapp_consent: e.target.checked })} /> WhatsApp consent
          </label>
          <div className="golvia-toolbar">
            <button className="golvia-btn-primary" onClick={save}>Save</button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Vouchers</h3>
        {customer.vouchers && customer.vouchers.length > 0 ? (
          <ul>
            {customer.vouchers.map(v => (
              <li key={v.id}>
                {v.type} — RM{v.value} off (min spend RM{v.min_spend})
                {v.expires_at ? ` — expires ${new Date(v.expires_at).toLocaleString()}` : ''}
              </li>
            ))}
          </ul>
        ) : <p className="golvia-empty">No usable vouchers.</p>}
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Purchase history</h3>
        {customer.invoices.length > 0 ? (
          <ul>{customer.invoices.map(i => <li key={i.id}>{i.invoice_number} — RM{i.total} — {i.status}</li>)}</ul>
        ) : <p className="golvia-empty">No purchases yet.</p>}
      </div>
    </div>
  );
}
