import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => { apiClient.get('/dashboard/summary').then(setSummary); }, []);
  if (!summary) return <p className="golvia-page">Loading...</p>;

  return (
    <div className="golvia-page">
      <h2>Dashboard</h2>

      <div className="golvia-card">
        <p style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--golvia-accent-dark)' }}>
          Today's sales: RM{summary.todaySalesTotal.toFixed(2)}
        </p>
        <p>{summary.todayTransactionCount} transaction(s)</p>
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Low stock</h3>
        {summary.lowStockVariants.length > 0 ? (
          <ul>{summary.lowStockVariants.map(v => <li key={v.id}>{v.product_name} — {v.variant_label} ({v.quantity} left)</li>)}</ul>
        ) : <p className="golvia-empty">Nothing low on stock right now.</p>}
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Birthdays today</h3>
        {summary.upcomingBirthdays.length > 0 ? (
          <ul>{summary.upcomingBirthdays.map(c => <li key={c.id}>{c.name}</li>)}</ul>
        ) : <p className="golvia-empty">No customer birthdays today.</p>}
      </div>
    </div>
  );
}
