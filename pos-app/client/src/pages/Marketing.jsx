import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Marketing() {
  const [pending, setPending] = useState([]);
  const [loaded, setLoaded] = useState(false);

  function load() {
    return apiClient.get('/marketing/pending').then(p => { setPending(p); setLoaded(true); });
  }

  useEffect(() => { load(); }, []);

  async function sendWhatsApp(customer) {
    try {
      await apiClient.post(`/marketing/${customer.id}/mark-sent`, { triggerType: customer.triggerType });
    } finally {
      window.open(customer.whatsappLink, '_blank');
      load();
    }
  }

  return (
    <div className="golvia-page">
      <h2>Marketing</h2>
      <p style={{ color: 'var(--golvia-text-muted)', fontSize: 13, marginBottom: 20 }}>
        This list only ever shows customers with a birthday <em>today</em>, or who had a new
        reward voucher issued <em>today</em> — it refreshes automatically each day.
      </p>

      <div className="golvia-card">
        {!loaded && <p>Loading...</p>}
        {loaded && pending.length === 0 && (
          <p className="golvia-empty">No marketing actions pending today. Check back tomorrow, or after a customer's next birthday or voucher.</p>
        )}
        {pending.map(c => (
          <div key={`${c.id}-${c.triggerType}`} style={{ padding: '10px 0', borderBottom: '1px solid var(--golvia-border)' }}>
            <p style={{ margin: '0 0 6px' }}>
              <strong>{c.name}</strong> <span className="golvia-badge">{c.triggerType}</span>
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>{c.message}</p>
            <button className="golvia-btn-primary" onClick={() => sendWhatsApp(c)}>Send via WhatsApp</button>
          </div>
        ))}
      </div>
    </div>
  );
}
