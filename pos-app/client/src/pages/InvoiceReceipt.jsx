import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

const REFUND_ERROR_MESSAGES = {
  INVOICE_ITEM_NOT_FOUND: 'One of the selected items could not be found on this invoice.',
  INVALID_REFUND_LINES: 'Enter a valid return quantity for at least one item.',
  REFUND_QUANTITY_EXCEEDS_REMAINING: 'The return quantity exceeds what is still refundable for one or more items.',
};

const EMAIL_RECEIPT_ERROR_MESSAGES = {
  NO_CUSTOMER_EMAIL: 'This customer has no email on file.',
  EMAIL_SEND_FAILED: 'Failed to send the receipt email. Please try again.',
};

export default function InvoiceReceipt() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [returnQuantities, setReturnQuantities] = useState({});
  const [refundPaymentMethod, setRefundPaymentMethod] = useState('Cash');
  const [refundError, setRefundError] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // { type: 'success' | 'error', text }
  const [sendingEmail, setSendingEmail] = useState(false);

  function loadInvoice() {
    return apiClient.get(`/invoices/${id}`).then(inv => {
      setInvoice(inv);
      setReturnQuantities({});
    });
  }

  useEffect(() => { loadInvoice(); }, [id]);

  if (!invoice) return <p>Loading...</p>;

  function updateReturnQuantity(itemId, value, max) {
    let qty = Number(value);
    if (Number.isNaN(qty) || qty < 0) qty = 0;
    if (qty > max) qty = max;
    setReturnQuantities(prev => ({ ...prev, [itemId]: qty }));
  }

  async function emailReceipt() {
    setEmailStatus(null);
    setSendingEmail(true);
    try {
      await apiClient.post(`/invoices/${id}/email-receipt`);
      setEmailStatus({ type: 'success', text: 'Receipt emailed to customer.' });
    } catch (err) {
      setEmailStatus({
        type: 'error',
        text: EMAIL_RECEIPT_ERROR_MESSAGES[err.data?.error] || err.data?.error || 'Failed to email receipt.',
      });
    } finally {
      setSendingEmail(false);
    }
  }

  async function processReturn() {
    setRefundError('');
    const lines = invoice.items
      .map(i => ({ invoiceItemId: i.id, quantity: Number(returnQuantities[i.id]) || 0 }))
      .filter(l => l.quantity > 0);
    if (lines.length === 0) {
      setRefundError('Enter a return quantity greater than 0 for at least one item.');
      return;
    }
    setProcessingRefund(true);
    try {
      await apiClient.post(`/invoices/${id}/refund`, { lines, paymentMethod: refundPaymentMethod });
      await loadInvoice();
    } catch (err) {
      setRefundError(REFUND_ERROR_MESSAGES[err.data?.error] || err.data?.error || 'Refund failed.');
    } finally {
      setProcessingRefund(false);
    }
  }

  return (
    <div>
      <style>{`@media print { @page { size: A5; margin: 10mm; } }`}</style>
      <div className="receipt-printable" style={{ width: '148mm', minHeight: '210mm', margin: '0 auto', padding: 16 }}>
        <h2>GOLVIA</h2>
        <p>16 Jalan SC 1, Pusat Perindustrian Sungai Chua, 43200 Kajang, Selangor, Malaysia</p>
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
        <p>Coins earned: {invoice.coins_earned}</p>
        {invoice.coins_redeemed > 0 && (
          <p>Coins redeemed: {invoice.coins_redeemed} (RM{(invoice.coins_redeemed / 100).toFixed(2)})</p>
        )}
        <button onClick={() => window.print()}>Print</button>
      </div>

      {invoice.customer && invoice.customer.email && (
        <div style={{ marginTop: 24 }}>
          <button onClick={emailReceipt} disabled={sendingEmail}>
            {sendingEmail ? 'Sending…' : 'Email receipt to customer'}
          </button>
          {emailStatus && (
            <p style={{ color: emailStatus.type === 'error' ? 'red' : 'green' }}>{emailStatus.text}</p>
          )}
        </div>
      )}

      {invoice.status !== 'refunded' && (
        <div style={{ marginTop: 24 }}>
          <h3>Process Return</h3>
          <table>
            <thead><tr><th>Item</th><th>Original Qty</th><th>Return Qty</th></tr></thead>
            <tbody>
              {invoice.items.map(i => (
                <tr key={i.id}>
                  <td>{i.product_name} ({i.variant_label})</td>
                  <td>{i.quantity}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={i.quantity}
                      value={returnQuantities[i.id] ?? 0}
                      onChange={e => updateReturnQuantity(i.id, e.target.value, i.quantity)}
                      style={{ width: 60 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <label>
            Refund payment method:{' '}
            <select value={refundPaymentMethod} onChange={e => setRefundPaymentMethod(e.target.value)}>
              <option>Cash</option>
              <option>DuitNow/QR</option>
              <option>Bank Transfer</option>
              <option>E-wallet</option>
            </select>
          </label>

          {refundError && <p style={{ color: 'red' }}>{refundError}</p>}
          <div>
            <button onClick={processReturn} disabled={processingRefund}>Process Return</button>
          </div>
        </div>
      )}
    </div>
  );
}
