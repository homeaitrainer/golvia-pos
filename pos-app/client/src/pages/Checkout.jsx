import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { flashElement, successPulse, countTo } from '../gsapMotion';
import { quoteSale } from '../pricing';

// A broad search ("s") matches every product in the catalogue. Capping the rendered list keeps the
// results panel scannable; the panel also scrolls internally, so match count can never push the
// order panel around.
const MAX_RESULTS = 8;
const SEARCH_DEBOUNCE_MS = 250;

const displayName = (product) => product.short_name || product.name;
const money = (n) => `RM${n.toFixed(2)}`;

function refocusScanUnlessMovingToField(e, scanRef) {
  const next = e.relatedTarget;
  const isFormControl = next && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(next.tagName);
  if (!isFormControl) {
    // preventScroll is essential, not a nicety. The scan input lives at the top of the page, and
    // focus() scrolls its target into view by default -- so returning focus here after the cashier
    // touched anything further down (a quantity, a discount, Remove) yanked the whole page back to
    // the top, forcing them to scroll down again on every single interaction.
    scanRef.current?.focus({ preventScroll: true });
  }
}

export default function Checkout() {
  const [search, setSearch] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  // cart lines: { variantId, name, variantLabel, unitPrice, quantity, itemDiscount, stock }
  const [cart, setCart] = useState([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', email: '', whatsapp_consent: false });
  const [lumpSumType, setLumpSumType] = useState('amount');
  const [lumpSumValue, setLumpSumValue] = useState(0);
  const [coinsToRedeem, setCoinsToRedeem] = useState(0);
  const [selectedVoucherId, setSelectedVoucherId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const scanRef = useRef(null);
  const cartCardRef = useRef(null);
  const checkoutBtnRef = useRef(null);
  const totalRef = useRef(null);
  const previousTotal = useRef(0);
  const latestCustomerSearch = useRef(0);
  const navigate = useNavigate();

  useEffect(() => { scanRef.current?.focus({ preventScroll: true }); }, []);

  // Debounced: the search box previously fired one request per keystroke.
  useEffect(() => {
    if (!search.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      apiClient.get(`/products?search=${encodeURIComponent(search)}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const selectedVoucher = customer?.vouchers?.find(v => String(v.id) === String(selectedVoucherId)) || null;

  const quote = quoteSale({
    items: cart,
    lumpSumDiscount: Number(lumpSumValue) > 0 ? { type: lumpSumType, value: Number(lumpSumValue) } : null,
    coinsToRedeem: Number(coinsToRedeem) || 0,
    voucher: selectedVoucher,
  });

  // Animate the headline figure whenever it changes, so a discount visibly moves the amount.
  useEffect(() => {
    countTo(totalRef.current, previousTotal.current, quote.total, money);
    previousTotal.current = quote.total;
  }, [quote.total]);

  function addVariantToCart(product, variant) {
    const stock = variant.quantity;
    const existing = cart.find(i => i.variantId === variant.id);
    if (existing && existing.quantity >= stock) {
      setError(`Only ${stock} of ${displayName(product)} (${variant.variant_label}) in stock.`);
      return;
    }
    setError('');
    setCart(prev => {
      if (existing) {
        return prev.map(i => i.variantId === variant.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        variantId: variant.id,
        name: displayName(product),
        variantLabel: variant.variant_label,
        unitPrice: variant.sell_price,
        quantity: 1,
        itemDiscount: 0,
        stock,
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

  // Stepping a line down to zero removes it, matching the Remove button.
  function setQuantity(variantId, nextQuantity) {
    setCart(prev => prev.flatMap(i => {
      if (i.variantId !== variantId) return [i];
      const clamped = Math.min(Math.max(0, Math.floor(Number(nextQuantity) || 0)), i.stock);
      return clamped === 0 ? [] : [{ ...i, quantity: clamped }];
    }));
  }

  // Live search over name, phone, and email: typing "Wil" lists every William as you go, rather
  // than making the cashier finish typing and press a button. Debounced so a five-letter name is
  // one request instead of five. Skipped entirely once a customer is attached, and below two
  // characters, where every customer in the shop would match.
  useEffect(() => {
    if (customer) return;
    const query = customerQuery.trim();

    // Every path through this effect bumps the counter, including this early return. An in-flight
    // request from a longer query would otherwise resolve *after* the list was cleared and put its
    // matches back -- so typing a name and then deleting it back to one character left stale
    // customers on screen under a query that no longer matched them.
    const requestId = ++latestCustomerSearch.current;

    if (query.length < 2) { setCustomerResults([]); setLookingUp(false); return; }

    // Drop the previous matches immediately rather than leaving them under a newer query. These
    // rows attach a customer to a real sale, so showing matches that do not correspond to what is
    // in the box is worse than briefly showing nothing.
    setCustomerResults([]);
    setLookingUp(true);

    // Debouncing alone does not make this safe: a request already in flight cannot be cancelled,
    // so a slow earlier response can still land after a newer one. Over the shared tunnel
    // (variable latency, unlike localhost) that reordering is entirely plausible. Stamp each
    // request and ignore any response that is no longer the newest.
    const timer = setTimeout(() => {
      apiClient.get(`/customers?search=${encodeURIComponent(query)}`)
        .then((matches) => {
          if (requestId !== latestCustomerSearch.current) return;
          setCustomerResults(matches);
        })
        .catch(() => {
          if (requestId !== latestCustomerSearch.current) return;
          setCustomerResults([]);
        })
        .finally(() => {
          if (requestId === latestCustomerSearch.current) setLookingUp(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [customerQuery, customer]);

  // Enter attaches the customer when the search has narrowed to exactly one -- so a full phone
  // number can be typed and committed without reaching for the mouse.
  function selectOnlyMatch() {
    if (customerResults.length === 1) selectCustomer(customerResults[0].id);
  }

  async function selectCustomer(customerId) {
    // The list endpoint returns membership but not vouchers; the detail endpoint has both, and the
    // voucher picker below needs them.
    const full = await apiClient.get(`/customers/${customerId}`);
    setCustomer(full);
    setCustomerResults([]);
    setSelectedVoucherId('');
    setCoinsToRedeem(0);
    setShowNewCustomerForm(false);
    setError('');
  }

  function clearCustomer() {
    setCustomer(null);
    setCustomerResults([]);
    setSelectedVoucherId('');
    setCoinsToRedeem(0);
  }

  async function createCustomerInline() {
    if (!newCustomerForm.name.trim() || !newCustomerForm.phone.trim()) {
      setError('Name and phone are required to create a customer.');
      return;
    }
    setError('');
    try {
      const c = await apiClient.post('/customers', newCustomerForm);
      setCustomer({ ...c, vouchers: [] }); // a brand-new customer has no vouchers yet
      setCustomerQuery(c.phone);
      setSelectedVoucherId('');
      setCoinsToRedeem(0);
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

  async function handleCheckout() {
    if (submitting) return;
    setSubmitting(true);
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
      successPulse(checkoutBtnRef.current, () => navigate(`/invoices/${invoice.id}/receipt?justCompleted=1`));
    } catch (err) {
      setSubmitting(false);
      setError(err.data?.error === 'INSUFFICIENT_STOCK' ? 'Not enough stock for one or more items.' :
                err.data?.error === 'INSUFFICIENT_COINS' ? 'Customer does not have enough coins.' :
                err.data?.error === 'VOUCHER_NO_VALUE' ? 'This voucher has no value left to apply — the cart total is already RM0 from other discounts or coin redemption. Reduce a discount or the coins redeemed to use this voucher.' :
                err.data?.error === 'INVALID_VOUCHER' ? 'The selected voucher is not valid for this sale.' :
                err.data?.error === 'INVALID_ITEM_QUANTITY' ? 'Check the item quantities, discounts, and coins entered — one of them is not a valid positive number.' :
                'Checkout failed.');
    }
  }

  const visibleResults = results.slice(0, MAX_RESULTS);
  const onBlurRefocus = (e) => refocusScanUnlessMovingToField(e, scanRef);

  return (
    <div className="golvia-page">
      <h2>Checkout</h2>

      <div className="golvia-register">
        {/* ---------- Left: find products ---------- */}
        <div className="golvia-register-main">
          <div className="golvia-card">
            <div className="golvia-toolbar">
              <input ref={scanRef} placeholder="Scan barcode / SKU here" value={scanInput}
                onChange={e => setScanInput(e.target.value)} onKeyDown={handleScan}
                onBlur={onBlurRefocus} style={{ minWidth: 220 }} />
              <input placeholder="Search products" value={search}
                onChange={e => setSearch(e.target.value)} onBlur={onBlurRefocus} style={{ minWidth: 220 }} />
            </div>

            {searching && <p className="golvia-results-note">Searching…</p>}

            {!searching && search.trim() && results.length === 0 && (
              <p className="golvia-empty">No products match “{search}”.</p>
            )}

            {visibleResults.length > 0 && (
              <>
                <div className="golvia-results">
                  {visibleResults.map(p => (
                    <div className="golvia-result-row" key={p.id}>
                      {p.image_url
                        ? <img className="golvia-thumb" src={p.image_url} alt="" />
                        : <span className="golvia-thumb" />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="golvia-result-name">{displayName(p)}</div>
                        <div className="golvia-variants">
                          {p.variants.map(v => (
                            <button
                              key={v.id}
                              className="golvia-variant-btn"
                              onClick={() => addVariantToCart(p, v)}
                              onBlur={onBlurRefocus}
                              disabled={v.quantity <= 0}
                              title={v.quantity <= 0 ? 'Out of stock' : `${v.quantity} in stock`}
                            >
                              {v.variant_label} · <span className="golvia-num">{money(v.sell_price)}</span>
                              {v.quantity <= 0 ? ' · out of stock' : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {results.length > MAX_RESULTS && (
                  <p className="golvia-results-note">
                    Showing {MAX_RESULTS} of {results.length} matches — keep typing to narrow it down.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* ---------- Right: the order (sticky, always visible) ---------- */}
        <div className="golvia-register-side">
          <div className="golvia-card" ref={cartCardRef}>
            <h3 style={{ marginTop: 0 }}>Cart</h3>
            {cart.length === 0
              ? <p className="golvia-empty">Scan or search to add items.</p>
              : cart.map(i => (
                <div className="golvia-cart-line" key={i.variantId}>
                  <div className="golvia-cart-name">{i.name} <span style={{ color: 'var(--golvia-text-muted)', fontWeight: 400 }}>({i.variantLabel})</span></div>
                  <div className="golvia-cart-amount golvia-num">{money(i.unitPrice * i.quantity)}</div>

                  <div className="golvia-cart-meta">
                    <span className="golvia-stepper">
                      <button onClick={() => setQuantity(i.variantId, i.quantity - 1)} aria-label="Decrease quantity">−</button>
                      <input
                        type="number" min="0" max={i.stock} value={i.quantity}
                        onChange={e => setQuantity(i.variantId, e.target.value)}
                        onBlur={onBlurRefocus}
                        aria-label={`Quantity for ${i.name}`}
                      />
                      <button
                        onClick={() => setQuantity(i.variantId, i.quantity + 1)}
                        disabled={i.quantity >= i.stock}
                        title={i.quantity >= i.stock ? `Only ${i.stock} in stock` : undefined}
                        aria-label="Increase quantity"
                      >+</button>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--golvia-text-muted)' }}>
                      @ <span className="golvia-num">{money(i.unitPrice)}</span>
                      {i.quantity >= i.stock ? ` · max ${i.stock}` : ''}
                    </span>
                  </div>

                  <div className="golvia-cart-meta" style={{ justifyContent: 'flex-end' }}>
                    <label style={{ fontSize: 12, color: 'var(--golvia-text-muted)' }}>
                      Disc. RM
                      <input type="number" min="0" value={i.itemDiscount}
                        onChange={e => updateItemDiscount(i.variantId, e.target.value)}
                        onBlur={onBlurRefocus} style={{ width: 62, marginLeft: 4 }} />
                    </label>
                    <button onClick={() => removeItem(i.variantId)}>Remove</button>
                  </div>
                </div>
              ))}
          </div>

          <div className="golvia-card">
            <h3 style={{ marginTop: 0 }}>Customer</h3>
            {customer ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {customer.name} <span className="golvia-badge">{customer.membership.tier}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--golvia-text-muted)' }}>
                    <span className="golvia-num">{customer.phone}</span>
                    {' · '}
                    <span className="golvia-num">{customer.membership.current_coin_balance}</span> coins
                  </div>
                </div>
                <button onClick={clearCustomer}>Change</button>
              </div>
            ) : (
              <>
                <div className="golvia-toolbar">
                  {/* autoComplete="off" (plus a non-obvious name) stops Chrome overlaying its own
                      saved-address dropdown on top of the live results below. */}
                  <input placeholder="Start typing a name or phone" value={customerQuery}
                    onChange={e => setCustomerQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') selectOnlyMatch(); }}
                    onBlur={onBlurRefocus} id="checkout-lookup-phone"
                    name="golvia-customer-search" autoComplete="off"
                    style={{ flex: 1, minWidth: 110 }} />
                  <button onClick={() => {
                    setShowNewCustomerForm(s => !s);
                    if (!showNewCustomerForm) setNewCustomerForm(f => ({ ...f, phone: customerQuery }));
                  }}>{showNewCustomerForm ? 'Cancel' : '+ New'}</button>
                </div>

                {lookingUp && <p className="golvia-results-note" style={{ margin: '0 0 8px' }}>Searching…</p>}

                {!lookingUp && customerQuery.trim().length >= 2 && customerResults.length === 0 && (
                  <p className="golvia-empty" style={{ padding: '4px 0 10px' }}>
                    No customer matches “{customerQuery.trim()}”. Use “+ New” to add them, or leave
                    it blank to sell as a guest.
                  </p>
                )}

                {/* Names repeat -- the shop already has two Williams -- so each row carries the
                    phone number to tell them apart rather than the first hit being assumed. */}
                {customerResults.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 12, color: 'var(--golvia-text-muted)', margin: '0 0 6px' }}>
                      {customerResults.length === 1
                        ? 'One match — click it, or press Enter:'
                        : `${customerResults.length} matches — pick the right one:`}
                    </p>
                    <div className="golvia-customer-results">
                      {customerResults.map(c => (
                        <button key={c.id} className="golvia-customer-hit" onClick={() => selectCustomer(c.id)}>
                          <span style={{ fontWeight: 600 }}>{c.name}</span>
                          <span style={{ fontSize: 12, color: 'var(--golvia-text-muted)' }}>
                            <span className="golvia-num">{c.phone}</span>
                            {c.membership ? <> · {c.membership.tier}</> : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {!customer && showNewCustomerForm && (
              <div style={{ borderTop: '1px solid var(--golvia-border)', paddingTop: 12, marginTop: 10 }}>
                <div className="golvia-field">
                  <label htmlFor="new-customer-name">Name</label>
                  <input id="new-customer-name" value={newCustomerForm.name}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                    onBlur={onBlurRefocus} style={{ width: '100%' }} />
                </div>
                <div className="golvia-field">
                  <label htmlFor="new-customer-phone">Phone</label>
                  <input id="new-customer-phone" value={newCustomerForm.phone}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                    onBlur={onBlurRefocus} style={{ width: '100%' }} />
                </div>
                <div className="golvia-field">
                  <label htmlFor="new-customer-email">Email (optional)</label>
                  <input id="new-customer-email" value={newCustomerForm.email}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                    onBlur={onBlurRefocus} style={{ width: '100%' }} />
                </div>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>
                  <input type="checkbox" checked={newCustomerForm.whatsapp_consent}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, whatsapp_consent: e.target.checked })}
                    onBlur={onBlurRefocus} /> WhatsApp consent
                </label>
                <button className="golvia-btn-primary" onClick={createCustomerInline}>Create &amp; use</button>
              </div>
            )}

            {customer && customer.vouchers && customer.vouchers.length > 0 && (
              <div className="golvia-field" style={{ marginTop: 10 }}>
                <label htmlFor="checkout-voucher">Voucher</label>
                <select id="checkout-voucher" value={selectedVoucherId}
                  onChange={e => setSelectedVoucherId(e.target.value)} onBlur={onBlurRefocus}
                  style={{ width: '100%' }}>
                  <option value="">None</option>
                  {customer.vouchers.map(v => (
                    <option key={v.id} value={v.id}>RM{v.value} off (min spend RM{v.min_spend})</option>
                  ))}
                </select>
                {quote.voucherIssue === 'MIN_SPEND' && (
                  <p className="golvia-error" style={{ marginTop: 4 }}>
                    Cart is below this voucher’s RM{selectedVoucher?.min_spend} minimum spend.
                  </p>
                )}
                {quote.voucherIssue === 'NO_VALUE' && (
                  <p className="golvia-error" style={{ marginTop: 4 }}>
                    Nothing left for this voucher to discount — reduce the coins or discount first.
                  </p>
                )}
              </div>
            )}

            {customer && (
              <div className="golvia-field">
                <label htmlFor="checkout-redeem-coins">
                  Redeem coins (max {customer.membership.current_coin_balance})
                </label>
                <input id="checkout-redeem-coins" type="number" min="0" step="1"
                  max={customer.membership.current_coin_balance}
                  value={coinsToRedeem} onChange={e => setCoinsToRedeem(e.target.value)}
                  onBlur={onBlurRefocus} style={{ width: '100%' }} />
                {Number(coinsToRedeem) > customer.membership.current_coin_balance && (
                  <p className="golvia-error" style={{ marginTop: 4 }}>
                    More than this customer has — they only have {customer.membership.current_coin_balance} coins.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="golvia-card">
            <h3 style={{ marginTop: 0 }}>Discount &amp; Payment</h3>
            <div className="golvia-toolbar">
              <select value={lumpSumType} onChange={e => setLumpSumType(e.target.value)} onBlur={onBlurRefocus}>
                <option value="amount">RM off</option>
                <option value="percent">% off</option>
              </select>
              <input type="number" min="0" value={lumpSumValue}
                onChange={e => setLumpSumValue(e.target.value)} onBlur={onBlurRefocus}
                placeholder="0" style={{ width: 90 }} />
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                onBlur={onBlurRefocus} style={{ flex: 1, minWidth: 120 }}>
                <option>Cash</option>
                <option>DuitNow/QR</option>
                <option>Bank Transfer</option>
                <option>E-wallet</option>
              </select>
            </div>

            <div className="golvia-total-rows">
              <div className="golvia-total-row"><span>Subtotal</span><span>{money(quote.subtotal)}</span></div>
              {quote.itemDiscountTotal > 0 && (
                <div className="golvia-total-row"><span>Item discounts</span><span>−{money(quote.itemDiscountTotal)}</span></div>
              )}
              {quote.lumpSum > 0 && (
                <div className="golvia-total-row"><span>Discount</span><span>−{money(quote.lumpSum)}</span></div>
              )}
              {quote.voucherDiscount > 0 && (
                <div className="golvia-total-row"><span>Voucher</span><span>−{money(quote.voucherDiscount)}</span></div>
              )}
              {quote.coinDiscount > 0 && (
                <div className="golvia-total-row">
                  <span>Coins ({quote.coinsApplied})</span><span>−{money(quote.coinDiscount)}</span>
                </div>
              )}
            </div>

            <div className="golvia-total-grand">
              <span className="golvia-total-grand-label">Total to collect</span>
              <span className="golvia-total-grand-value" ref={totalRef}>{money(quote.total)}</span>
            </div>

            {error && <p className="golvia-error" style={{ marginTop: 10 }}>{error}</p>}

            <button ref={checkoutBtnRef} className="golvia-btn-primary"
              onClick={handleCheckout} disabled={cart.length === 0 || submitting}
              style={{ width: '100%', marginTop: 12, padding: '12px 18px', fontSize: 14 }}>
              {submitting ? 'Completing…' : 'Complete Sale'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
