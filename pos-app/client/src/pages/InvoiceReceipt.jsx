import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function InvoiceReceipt() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    apiClient.get(`/invoices/${id}`).then(setInvoice);
  }, [id]);

  if (!invoice) return <p>Loading...</p>;

  return (
    <div style={{ width: '148mm', minHeight: '210mm', margin: '0 auto', padding: 16 }}>
      <h2>GOLVIA</h2>
      <p>16, Jalan SC 1, Pusat Perindustrian Sungai Chua, 43200 Kajang, Selangor, Malaysia</p>
      <p>Invoice: {invoice.invoice_number}</p>
      <p>Date: {new Date(invoice.created_at).toLocaleString()}</p>
      {invoice.customer && <p>Customer: {invoice.customer.name} ({invoice.customer.phone})</p>}
      <table width="100%">
        <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Discount</th></tr></thead>
        <tbody>
          {invoice.items.map(i => (
            <tr key={i.id}><td>{i.product_name} ({i.variant_label})</td><td>{i.quantity}</td><td>RM{i.unit_price}</td><td>RM{i.item_discount}</td></tr>
          ))}
        </tbody>
      </table>
      <p>Subtotal: RM{invoice.subtotal.toFixed(2)}</p>
      <p>Discount: RM{invoice.discount_total.toFixed(2)}</p>
      <p><b>Total: RM{invoice.total.toFixed(2)}</b></p>
      <p>Payment method: {invoice.payment_method}</p>
      <button onClick={() => window.print()}>Print</button>
    </div>
  );
}
