import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  useEffect(() => { apiClient.get('/invoices').then(setInvoices); }, []);
  return (
    <div>
      <h2>Sales History</h2>
      <ul>
        {invoices.map(i => (
          <li key={i.id}>
            <Link to={`/invoices/${i.id}/receipt`}>{i.invoice_number}</Link> — RM{i.total} — {i.status} — {new Date(i.created_at).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
