import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import Icon from '../components/Icon';

function StatCard({ icon, tint, ink, value, label }) {
  return (
    <div className="golvia-stat">
      <div className="golvia-stat-icon" style={{ background: `var(${tint})`, color: `var(${ink})` }}>
        <Icon name={icon} size={20} />
      </div>
      <div>
        <div className="golvia-stat-value">{value}</div>
        <div className="golvia-stat-label">{label}</div>
      </div>
    </div>
  );
}

// The date string is parsed with an explicit T00:00:00 so it reads as LOCAL midnight -- a bare
// 'YYYY-MM-DD' is parsed as UTC midnight, which renders the wrong weekday west of UTC.
function weekdayLabel(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
}

function SalesChart({ days }) {
  // Bars are scaled against the busiest day. A day that nets negative (more refunded than sold)
  // has no meaningful bar height, so it collapses to the CSS min-height sliver -- the exact
  // figure is still available on hover.
  const peak = Math.max(...days.map(d => d.total), 1);

  return (
    <div className="golvia-chart">
      {days.map(day => (
        <div
          key={day.date}
          className="golvia-chart-col"
          title={`${day.date}: RM${day.total.toFixed(2)}`}
        >
          <div
            className="golvia-chart-bar"
            style={{ height: `${day.total > 0 ? (day.total / peak) * 100 : 0}%` }}
          />
          <span className="golvia-chart-label">{weekdayLabel(day.date)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState(null);

  useEffect(() => {
    apiClient.get('/dashboard/summary').then(setSummary);
    apiClient.get('/dashboard/sales-trend').then(setTrend);
  }, []);

  if (!summary) return <p className="golvia-page">Loading...</p>;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="golvia-page">
      <h2>Today · {today}</h2>

      <div className="golvia-stats">
        <StatCard
          icon="trending" tint="--golvia-tint-teal" ink="--golvia-ink-teal"
          value={`RM${summary.todaySalesTotal.toFixed(2)}`} label="Today's Sales"
        />
        <StatCard
          icon="bag" tint="--golvia-tint-blue" ink="--golvia-ink-blue"
          value={summary.todayTransactionCount} label="Transactions"
        />
        <StatCard
          icon="alert" tint="--golvia-tint-amber" ink="--golvia-ink-amber"
          value={summary.lowStockVariants.length} label="Low Stock Items"
        />
        <StatCard
          icon="gift" tint="--golvia-tint-purple" ink="--golvia-ink-purple"
          value={summary.upcomingBirthdays.length} label="Birthdays Today"
        />
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Sales — last 7 days</h3>
        {trend ? <SalesChart days={trend} /> : <p className="golvia-empty">Loading chart...</p>}
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Low stock</h3>
        {summary.lowStockVariants.length > 0 ? (
          <table>
            <thead><tr><th>Product</th><th>Variant</th><th>Left</th></tr></thead>
            <tbody>
              {summary.lowStockVariants.map(v => (
                <tr key={v.id}>
                  <td>{v.product_name}</td>
                  <td>{v.variant_label}</td>
                  <td>{v.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
