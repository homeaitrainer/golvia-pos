import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { flashElement, successPulse } from '../gsapMotion';

function refocusScanUnlessMovingToField(e, scanRef) {
  const next = e.relatedTarget;
  const isFormControl = next && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(next.tagName);
  if (!isFormControl) {
    scanRef.current?.focus();
  }
}

export default function Checkout() {
  const [search, setSearch] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]); // {variantId, name, variantLabel, unitPrice, quantity, itemDiscount}
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState(null);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', email: '', whatsapp_consent: false });
  const [lumpSumType, setLumpSumType] = useState('amount');
  const [lumpSumValue, setLumpSumValue] = useState(0);
  const [coinsToRedeem, setCoinsToRedeem] = useState(0);
  const [selectedVoucherId, setSelectedVoucherId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [error, setError] = useState('');
  const scanRef = useRef(null);
  const cartCardRef = useRef(null);
  const checkoutBtnRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { scanRef.current?.focus(); }, []);

  async function runSearch(q) {
    setSearch(q);
    if (!q) return setResults([]);
    const products = await apiClient.get(`/products?search=${encodeURIComponent(q)}`);
    setResults(products);
  }

  function addVariantToCart(product, variant) {
    setCart(prev => {
      const existing = prev.find(i => i.variantId === variant.id);
      if (existing) {
        return prev.map(i => i.variantId === variant.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        variantId: variant.id, name: product.name, variantLabel: variant.variant_label,
        unitPrice: variant.sell_price, quantity: 1, itemDiscount: 0,
      }];
    });
    flashElement(cartCardRef.current);
  }

  async function handleScan(e) {
    if (e.key !== 'Enter') return;
    const sku = scanInput.trim();
    setScanInput('');
    if (!sku) return;
    try {
      const { product, variant } = await apiClient.get(`/products/lookup?sku=${encodeURIComponent(sku)}`);
      addVariantToCart(product, variant);
    } catch {
      setError(`No product found for SKU ${sku}`);
    }
  }

  async function lookupCustomer() {
    try {
      const c = await apiClient.get(`/customers/by-phone/${encodeURIComponent(phone)}`);
      setCustomer(c);
      setSelectedVoucherId('');
      setShowNewCustomerForm(false);
    } catch {
      setCustomer(null);
      setSelectedVoucherId('');
      setError('Customer not found — use "+ New customer" below to add them, or check out as guest.');
    }
  }

  async function createCustomerInline() {
    setError('');
    try {
      const c = await apiClient.post('/customers', newCustomerForm);
      setCustomer({ ...c, vouchers: [] }); // a brand-new customer has no vouchers yet
      setPhone(c.phone);
      setSelectedVoucherId('');
      setShowNewCustomerForm(false);
      setNewCustomerForm({ name: '', phone: '', email: '', whatsapp_consent: false });
    } catch (err) {
      setError(err.data?.error === 'PHONE_EXISTS'
        ? 'A customer with this phone number already exists — try "Look up" instead.'
        : 'Could not create customer.');
    }
  }

  function updateItemDiscount(variantId, value) {
    setCart(prev => prev.map(i => i.variantId === variantId ? { ...i, itemDiscount: Number(value) } : i));
  }

  function removeItem(variantId) {
    setCart(prev => prev.filter(i => i.variantId !== variantId));
  }

  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  async function handleCheckout() {
    setError('');
    try {
      const invoice = await apiClient.post('/invoices', {
        customerId: customer ? customer.id : null,
        items: cart.map(i => ({ variantId: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice, itemDiscount: i.itemDiscount })),
        lumpSumDiscount: lumpSumValue > 0 ? { type: lumpSumType, value: Number(lumpSumValue) } : null,
        coinsToRedeem: Number(coinsToRedeem) || 0,
        paymentMethod,
        voucherId: selectedVoucherId ? Number(selectedVoucherId) : null,
      });
      successPulse(checkoutBtnRef.current, () => navigate(`/invoices/${invoice.id}/receipt`));
    } catch (err) {
      setError(err.data?.error === 'INSUFFICIENT_STOCK' ? 'Not enough stock for one or more items.' :
                err.data?.error === 'INSUFFICIENT_COINS' ? 'Customer does not have enough coins.' :
                err.data?.error === 'VOUCHER_NO_VALUE' ? 'This voucher has no value left to apply — the cart total is already RM0 from other discounts or coin redemption. Reduce a discount or the coins redeemed to use this voucher.' :
                err.data?.error === 'INVALID_VOUCHER' ? 'The selected voucher is not valid for this sale.' :
                err.data?.error === 'INVALID_ITEM_QUANTITY' ? 'Check the item quantities, discounts, and coins entered — one of them is not a valid positive number.' :
                'Checkout failed.');
    }
  }

  return (
    <div className="golvia-page">
      <h2>Checkout</h2>

      <div className="golvia-card">
        <div className="golvia-toolbar">
          <input ref={scanRef} placeholder="Scan barcode / SKU here" value={scanInput}
            onChange={e => setScanInput(e.target.value)} onKeyDown={handleScan}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />
          <input placeholder="Search products" value={search} onChange={e => runSearch(e.target.value)}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />
        </div>
        {results.length > 0 && (
          <table>
            <tbody>
              {results.map(p => (
                <tr key={p.id}>
                  <td style={{ width: 50 }}>
                    {p.image_url ? <img className="golvia-thumb" src={p.image_url} alt="" /> : <span className="golvia-thumb" />}
                  </td>
                  <td>{p.name}</td>
                  <td>
                    {p.variants.map(v => (
                      <button key={v.id} onClick={() => addVariantToCart(p, v)} style={{ marginRight: 6 }}>
                        {v.variant_label} — RM{v.sell_price} (add)
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="golvia-card" ref={cartCardRef}>
        <h3 style={{ marginTop: 0 }}>Cart</h3>
        <table>
          <tbody>
            {cart.map(i => (
              <tr key={i.variantId}>
                <td>{i.name} ({i.variantLabel})</td>
                <td>x{i.quantity}</td>
                <td>RM{i.unitPrice}</td>
                <td>
                  Discount RM <input type="number" min="0" value={i.itemDiscount}
                    onChange={e => updateItemDiscount(i.variantId, e.target.value)}
                    onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} style={{ width: 60 }} />
                </td>
                <td><button onClick={() => removeItem(i.variantId)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Customer</h3>
        <div className="golvia-toolbar">
          <input placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />
          <button onClick={lookupCustomer}>Look up</button>
          {!customer && <button onClick={() => setShowNewCustomerForm(s => !s)}>{showNewCustomerForm ? 'Cancel' : '+ New customer'}</button>}
        </div>

        {customer && (
          <p>{customer.name} — <span className="golvia-badge">{customer.membership.tier}</span> {customer.membership.current_coin_balance} coins</p>
        )}

        {!customer && showNewCustomerForm && (
          <div style={{ borderTop: '1px solid var(--golvia-border)', paddingTop: 12, marginTop: 8 }}>
            <div className="golvia-field">
              <label>Name</label>
              <input value={newCustomerForm.name} onChange={e => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} style={{ width: '100%' }} />
            </div>
            <div className="golvia-field">
              <label>Phone</label>
              <input value={newCustomerForm.phone} onChange={e => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} style={{ width: '100%' }} />
            </div>
            <div className="golvia-field">
              <label>Email (optional)</label>
              <input value={newCustomerForm.email} onChange={e => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} style={{ width: '100%' }} />
            </div>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <input type="checkbox" checked={newCustomerForm.whatsapp_consent}
                onChange={e => setNewCustomerForm({ ...newCustomerForm, whatsapp_consent: e.target.checked })}
                onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} /> WhatsApp consent
            </label>
            <button className="golvia-btn-primary" onClick={createCustomerInline}>Create &amp; use for this sale</button>
          </div>
        )}

        {customer && customer.vouchers && customer.vouchers.length > 0 && (
          <div className="golvia-field">
            <label>Voucher</label>
            <select value={selectedVoucherId} onChange={e => setSelectedVoucherId(e.target.value)}
              onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)}>
              <option value="">None</option>
              {customer.vouchers.map(v => (
                <option key={v.id} value={v.id}>
                  RM{v.value} off (min spend RM{v.min_spend})
                </option>
              ))}
            </select>
          </div>
        )}

        {customer && (
          <div className="golvia-field">
            <label>Redeem coins</label>
            <input type="number" min="0" step="1" value={coinsToRedeem} onChange={e => setCoinsToRedeem(e.target.value)}
              onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />
          </div>
        )}
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Discounts &amp; Payment</h3>
        <div className="golvia-toolbar">
          <select value={lumpSumType} onChange={e => setLumpSumType(e.target.value)}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)}>
            <option value="amount">RM amount</option>
            <option value="percent">%</option>
          </select>
          <input type="number" value={lumpSumValue} onChange={e => setLumpSumValue(e.target.value)}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} placeholder="Lump-sum discount" />
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)}>
            <option>Cash</option>
            <option>DuitNow/QR</option>
            <option>Bank Transfer</option>
            <option>E-wallet</option>
          </select>
        </div>

        <p style={{ fontSize: 18, fontWeight: 'bold' }}>Subtotal: RM{subtotal.toFixed(2)}</p>
        {error && <p className="golvia-error">{error}</p>}
        <button ref={checkoutBtnRef} className="golvia-btn-primary" onClick={handleCheckout} disabled={cart.length === 0}>Complete Sale</button>
      </div>
    </div>
  );
}
