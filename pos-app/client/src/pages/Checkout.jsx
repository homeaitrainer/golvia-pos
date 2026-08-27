import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

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
  const [lumpSumType, setLumpSumType] = useState('amount');
  const [lumpSumValue, setLumpSumValue] = useState(0);
  const [coinsToRedeem, setCoinsToRedeem] = useState(0);
  const [selectedVoucherId, setSelectedVoucherId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [error, setError] = useState('');
  const scanRef = useRef(null);
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
    } catch {
      setCustomer(null);
      setSelectedVoucherId('');
      setError('Customer not found — you can create one from the Customers page, or check out as guest.');
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
      navigate(`/invoices/${invoice.id}/receipt`);
    } catch (err) {
      setError(err.data?.error === 'INSUFFICIENT_STOCK' ? 'Not enough stock for one or more items.' :
                err.data?.error === 'INSUFFICIENT_COINS' ? 'Customer does not have enough coins.' :
                err.data?.error === 'VOUCHER_NO_VALUE' ? 'This voucher has no value left to apply — the cart total is already RM0 from other discounts or coin redemption. Reduce a discount or the coins redeemed to use this voucher.' :
                err.data?.error === 'INVALID_VOUCHER' ? 'The selected voucher is not valid for this sale.' :
                'Checkout failed.');
    }
  }

  return (
    <div>
      <h2>Checkout</h2>
      <input ref={scanRef} placeholder="Scan barcode / SKU here" value={scanInput}
        onChange={e => setScanInput(e.target.value)} onKeyDown={handleScan}
        onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />
      <input placeholder="Search products" value={search} onChange={e => runSearch(e.target.value)}
        onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />
      <ul>
        {results.map(p => (
          <li key={p.id}>
            {p.name}
            {p.variants.map(v => (
              <button key={v.id} onClick={() => addVariantToCart(p, v)}>
                {v.variant_label} — RM{v.sell_price} (add)
              </button>
            ))}
          </li>
        ))}
      </ul>

      <h3>Cart</h3>
      <table>
        <tbody>
          {cart.map(i => (
            <tr key={i.variantId}>
              <td>{i.name} ({i.variantLabel})</td>
              <td>x{i.quantity}</td>
              <td>RM{i.unitPrice}</td>
              <td>
                Discount RM <input type="number" value={i.itemDiscount}
                  onChange={e => updateItemDiscount(i.variantId, e.target.value)}
                  onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} style={{ width: 60 }} />
              </td>
              <td><button onClick={() => removeItem(i.variantId)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Customer</h3>
      <input placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)}
        onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />
      <button onClick={lookupCustomer}>Look up</button>
      {customer && <p>{customer.name} — {customer.membership.tier} tier, {customer.membership.current_coin_balance} coins</p>}
      {customer && customer.vouchers && customer.vouchers.length > 0 && (
        <div>
          <label>Voucher:{' '}
            <select value={selectedVoucherId} onChange={e => setSelectedVoucherId(e.target.value)}
              onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)}>
              <option value="">None</option>
              {customer.vouchers.map(v => (
                <option key={v.id} value={v.id}>
                  RM{v.value} off (min spend RM{v.min_spend})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <h3>Discounts</h3>
      <select value={lumpSumType} onChange={e => setLumpSumType(e.target.value)}
        onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)}>
        <option value="amount">RM amount</option>
        <option value="percent">%</option>
      </select>
      <input type="number" value={lumpSumValue} onChange={e => setLumpSumValue(e.target.value)}
        onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />

      {customer && (
        <div>
          <label>Redeem coins: <input type="number" value={coinsToRedeem} onChange={e => setCoinsToRedeem(e.target.value)}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} /></label>
        </div>
      )}

      <h3>Payment</h3>
      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
        onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)}>
        <option>Cash</option>
        <option>DuitNow/QR</option>
        <option>Bank Transfer</option>
        <option>E-wallet</option>
      </select>

      <p>Subtotal: RM{subtotal.toFixed(2)}</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button onClick={handleCheckout} disabled={cart.length === 0}>Complete Sale</button>
    </div>
  );
}
