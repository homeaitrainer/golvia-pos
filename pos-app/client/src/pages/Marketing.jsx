import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Marketing() {
  const [pending, setPending] = useState([]);

  function load() {
    return apiClient.get('/marketing/pending').then(setPending);
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
    <div>
      <h2>Marketing — Pending Today</h2>
      <ul>
        {pending.map(c => (
          <li key={`${c.id}-${c.triggerType}`}>
            {c.name} — {c.triggerType} — {c.message}{' '}
            <button onClick={() => sendWhatsApp(c)}>Send via WhatsApp</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
