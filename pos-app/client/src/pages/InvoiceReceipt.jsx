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

  if (!invoice) return <p className="golvia-page">Loading...</p>;

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
    <div className="golvia-page">
      <style>{`
        @media print {
          @page { size: A5; margin: 10mm; }
          body * { visibility: hidden; }
          .receipt-printable, .receipt-printable * { visibility: visible; }
          .receipt-printable {
            position: absolute; left: 0; top: 0;
            width: 100% !important; max-width: 128mm !important; min-height: 0 !important;
            box-sizing: border-box; padding: 0 !important; border: none !important; box-shadow: none !important;
          }
          .receipt-printable button { display: none; }
        }
      `}</style>

      <div className="receipt-printable golvia-card" style={{ maxWidth: 380, margin: '0 auto', fontFamily: 'var(--golvia-font-heading)' }}>
        <div style={{ textAlign: 'center', letterSpacing: 3, fontSize: 22, color: 'var(--golvia-accent-dark)', fontWeight: 'bold' }}>GOLVIA</div>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--golvia-text-muted)', fontFamily: 'var(--golvia-font-body)', marginTop: 4, lineHeight: 1.5 }}>
          16 Jalan SC 1, Pusat Perindustrian Sungai Chua<br />43200 Kajang, Selangor, Malaysia
        </div>
        <hr style={{ border: 'none', borderTop: '2px solid var(--golvia-accent)', margin: '12px 0' }} />

        <div style={{ fontSize: 12, fontFamily: 'var(--golvia-font-body)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Invoice</span><span>{invoice.invoice_number}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Date</span><span>{new Date(invoice.created_at).toLocaleString()}</span></div>
          {invoice.customer && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Customer</span>
              <span>{invoice.customer.name} {invoice.customer.tier && <span className="golvia-badge">{invoice.customer.tier}</span>}</span>
            </div>
          )}
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid var(--golvia-border)', margin: '10px 0' }} />

        <table style={{ fontFamily: 'var(--golvia-font-body)' }}>
          <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
          <tbody>
            {invoice.items.map(i => (
              <tr key={i.id}>
                <td>{i.product_name} ({i.variant_label})</td>
                <td>{i.quantity}</td>
                <td>RM{(i.unit_price * i.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontFamily: 'var(--golvia-font-body)', fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Subtotal</span><span>RM{invoice.subtotal.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Discount</span><span>−RM{invoice.discount_total.toFixed(2)}</span></div>
          {invoice.coins_redeemed > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>Coins redeemed</span><span>−RM{(invoice.coins_redeemed / 100).toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 16, borderTop: '1px solid var(--golvia-text)', marginTop: 6, paddingTop: 6 }}>
            <span>Total ({invoice.payment_method})</span><span>RM{invoice.total.toFixed(2)}</span>
          </div>
        </div>

        {invoice.customer && (
          <div style={{ background: 'var(--golvia-accent-tint)', border: '1px solid var(--golvia-border)', borderRadius: 4, padding: '8px 10px', marginTop: 12, fontSize: 11, fontFamily: 'var(--golvia-font-body)', color: 'var(--golvia-accent-dark)' }}>
            + {invoice.coins_earned} coins earned this visit
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--golvia-text-muted)', fontFamily: 'var(--golvia-font-body)', marginTop: 16 }}>
          Thank you for shopping with GOLVIA
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {invoice.customer && invoice.customer.email && (
        <div className="golvia-card" style={{ maxWidth: 380, margin: '20px auto 0' }}>
          <button onClick={emailReceipt} disabled={sendingEmail}>
            {sendingEmail ? 'Sending…' : 'Email receipt to customer'}
          </button>
          {emailStatus && (
            <p className={emailStatus.type === 'error' ? 'golvia-error' : 'golvia-success'}>{emailStatus.text}</p>
          )}
        </div>
      )}

      {invoice.status !== 'refunded' && (
        <div className="golvia-card" style={{ maxWidth: 380, margin: '20px auto 0' }}>
          <h3 style={{ marginTop: 0 }}>Process Return</h3>
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

          <div className="golvia-field">
            <label>Refund payment method</label>
            <select value={refundPaymentMethod} onChange={e => setRefundPaymentMethod(e.target.value)}>
              <option>Cash</option>
              <option>DuitNow/QR</option>
              <option>Bank Transfer</option>
              <option>E-wallet</option>
            </select>
          </div>

          {refundError && <p className="golvia-error">{refundError}</p>}
          <button onClick={processReturn} disabled={processingRefund}>Process Return</button>
        </div>
      )}
    </div>
  );
}
