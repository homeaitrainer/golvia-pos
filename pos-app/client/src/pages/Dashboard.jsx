import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => { apiClient.get('/dashboard/summary').then(setSummary); }, []);
  if (!summary) return <p>Loading...</p>;

  return (
    <div>
      <h2>Dashboard</h2>
      <p>Today's sales: RM{summary.todaySalesTotal.toFixed(2)} ({summary.todayTransactionCount} transactions)</p>
      <h3>Low stock</h3>
      <ul>{summary.lowStockVariants.map(v => <li key={v.id}>{v.product_name} — {v.variant_label} ({v.quantity} left)</li>)}</ul>
      <h3>Birthdays today</h3>
      <ul>{summary.upcomingBirthdays.map(c => <li key={c.id}>{c.name}</li>)}</ul>
    </div>
  );
}
