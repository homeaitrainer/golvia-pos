import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Marketing() {
  const [pending, setPending] = useState([]);
  useEffect(() => { apiClient.get('/marketing/pending').then(setPending); }, []);
  return (
    <div>
      <h2>Marketing — Pending Today</h2>
      <ul>
        {pending.map(c => (
          <li key={c.id}>
            {c.name} — {c.triggerType} — {c.message}{' '}
            <a href={c.whatsappLink} target="_blank" rel="noreferrer">Send via WhatsApp</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
