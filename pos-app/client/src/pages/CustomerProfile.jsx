import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function CustomerProfile() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);

  useEffect(() => { apiClient.get(`/customers/${id}`).then(setCustomer); }, [id]);
  if (!customer) return <p>Loading...</p>;

  return (
    <div>
      <h2>{customer.name}</h2>
      <p>Phone: {customer.phone} | Email: {customer.email}</p>
      <p>Tier: {customer.membership.tier} | Lifetime coins: {customer.membership.lifetime_coins} | Balance: {customer.membership.current_coin_balance}</p>
      <p>Notes: {customer.notes}</p>
      <h3>Purchase history</h3>
      <ul>{customer.invoices.map(i => <li key={i.id}>{i.invoice_number} — RM{i.total} — {i.status}</li>)}</ul>
    </div>
  );
}
