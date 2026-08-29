import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  useEffect(() => { apiClient.get('/invoices').then(setInvoices); }, []);
  return (
    <div className="golvia-page">
      <h2>Sales History</h2>
      <div className="golvia-card">
        <table>
          <thead><tr><th>Invoice</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {invoices.map(i => (
              <tr key={i.id}>
                <td><Link to={`/invoices/${i.id}/receipt`}>{i.invoice_number}</Link></td>
                <td className="golvia-num">RM{i.total.toFixed(2)}</td>
                <td><span className={`golvia-badge${i.status !== 'completed' ? ' golvia-badge-refunded' : ''}`}>{i.status}</span></td>
                <td>{new Date(i.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && <p className="golvia-empty">No sales yet.</p>}
      </div>
    </div>
  );
}
