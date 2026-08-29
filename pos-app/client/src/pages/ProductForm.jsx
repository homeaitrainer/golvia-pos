import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

const EMPTY_ADJUSTMENT = { variantId: null, delta: '', reason: '' };

export default function ProductForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', short_name: '', category: '', brand: '', description: '', image_url: '' });
  const [variants, setVariants] = useState([{ variant_label: '', sku: '', barcode: '', cost_price: 0, sell_price: 0, quantity: 0 }]);
  // Replaces the old window.prompt() flow: an inline form that can be validated before submitting
  // and genuinely cancelled. Cancelling a prompt() returned null, which Number() turned into 0 --
  // so backing out of the old dialog still sent a "change stock by 0" adjustment.
  const [adjustment, setAdjustment] = useState(EMPTY_ADJUSTMENT);
  const [adjustError, setAdjustError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!isNew) apiClient.get(`/products/${id}`).then(p => { setForm(p); setVariants(p.variants); });
  }, [id]);

  function updateVariant(idx, field, value) {
    setVariants(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  }

  async function save() {
    setSaveError('');
    if (!form.name.trim()) { setSaveError('Product name is required.'); return; }
    try {
      if (isNew) {
        await apiClient.post('/products', { ...form, variants });
      } else {
        await apiClient.put(`/products/${id}`, {
          ...form,
          variants: variants.map(v => ({ id: v.id, cost_price: v.cost_price, sell_price: v.sell_price, barcode: v.barcode })),
        });
      }
      navigate('/products');
    } catch (err) {
      setSaveError(err.data?.error || err.message || 'Could not save this product.');
    }
  }

  function openAdjustment(variantId) {
    setAdjustError('');
    setAdjustment({ variantId, delta: '', reason: '' });
  }

  async function submitAdjustment() {
    const delta = Number(adjustment.delta);
    if (!adjustment.delta.trim() || !Number.isInteger(delta) || delta === 0) {
      setAdjustError('Enter a whole number to add or remove, e.g. 5 or -2.');
      return;
    }
    if (!adjustment.reason.trim()) {
      setAdjustError('A reason is required — it is kept as the audit record for this change.');
      return;
    }
    try {
      await apiClient.post(`/products/${id}/variants/${adjustment.variantId}/adjust-stock`, {
        delta, reason: adjustment.reason.trim(),
      });
      const product = await apiClient.get(`/products/${id}`);
      setVariants(product.variants);
      setAdjustment(EMPTY_ADJUSTMENT);
      setAdjustError('');
    } catch (err) {
      setAdjustError(err.data?.error === 'REASON_REQUIRED'
        ? 'A reason is required for stock adjustments.'
        : (err.data?.error || err.message || 'Stock adjustment failed.'));
    }
  }

  const adjustingVariant = variants.find(v => v.id === adjustment.variantId);
  const previewQuantity = adjustingVariant && Number.isFinite(Number(adjustment.delta)) && adjustment.delta.trim()
    ? adjustingVariant.quantity + Number(adjustment.delta)
    : null;

  return (
    <div className="golvia-page">
      <h2>{isNew ? 'New Product' : 'Edit Product'}</h2>

      <div className="golvia-card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div>
          {form.image_url
            ? <img className="golvia-thumb-lg" src={form.image_url} alt="" />
            : <div className="golvia-thumb-lg" />}
        </div>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="golvia-field">
            <label htmlFor="product-short-name">Display name</label>
            <input id="product-short-name" value={form.short_name || ''}
              onChange={e => setForm({ ...form, short_name: e.target.value })}
              placeholder="Shown at checkout and on receipts" style={{ width: '100%' }} />
            <p style={{ fontSize: 11, color: 'var(--golvia-text-muted)', margin: '4px 0 0' }}>
              What staff and customers see. Leave blank to derive it from the full name below.
            </p>
          </div>
          <div className="golvia-field">
            <label htmlFor="product-name">Full name</label>
            <textarea id="product-name" value={form.name} rows={2}
              onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} />
          </div>
          <div className="golvia-field"><label htmlFor="product-category">Category</label><input id="product-category" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label htmlFor="product-brand">Brand</label><input id="product-brand" value={form.brand || ''} onChange={e => setForm({ ...form, brand: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label htmlFor="product-image-url">Image URL</label><input id="product-image-url" value={form.image_url || ''} onChange={e => setForm({ ...form, image_url: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label htmlFor="product-description">Description</label><textarea id="product-description" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} style={{ width: '100%' }} /></div>
        </div>
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Variants</h3>
        <p style={{ fontSize: 12, color: 'var(--golvia-text-muted)', marginTop: 0 }}>
          To make an item scannable: click its <strong>Barcode</strong> box and scan the physical
          label — the scanner types the code straight in. Save, and that code will then find this
          item at checkout.
        </p>
        <table>
          <thead>
            <tr>
              <th>Label</th><th>SKU</th><th>Barcode</th><th>Cost</th><th>Price</th><th>Qty</th>{!isNew && <th></th>}
            </tr>
          </thead>
          <tbody>
            {variants.map((v, idx) => (
              <tr key={v.id ?? idx}>
                <td><input placeholder="Label" value={v.variant_label} onChange={e => updateVariant(idx, 'variant_label', e.target.value)} style={{ width: 110 }} /></td>
                <td><input placeholder="SKU" value={v.sku} onChange={e => updateVariant(idx, 'sku', e.target.value)} style={{ width: 130 }} /></td>
                <td>
                  <input placeholder="Scan here" value={v.barcode || ''}
                    onChange={e => updateVariant(idx, 'barcode', e.target.value)}
                    style={{ width: 140 }} className="golvia-num" />
                </td>
                <td><input type="number" value={v.cost_price} onChange={e => updateVariant(idx, 'cost_price', Number(e.target.value))} style={{ width: 80 }} /></td>
                <td><input type="number" value={v.sell_price} onChange={e => updateVariant(idx, 'sell_price', Number(e.target.value))} style={{ width: 80 }} /></td>
                <td>
                  <input type="number" value={v.quantity} readOnly={!isNew}
                    title={!isNew ? 'Use Adjust stock so the change is recorded with a reason' : undefined}
                    onChange={e => isNew && updateVariant(idx, 'quantity', Number(e.target.value))}
                    style={{ width: 70, background: !isNew ? 'var(--golvia-bg)' : undefined }} />
                </td>
                {!isNew && (
                  <td>{v.id && <button onClick={() => openAdjustment(v.id)}>Adjust stock</button>}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {isNew && (
          <button onClick={() => setVariants([...variants, { variant_label: '', sku: '', barcode: '', cost_price: 0, sell_price: 0, quantity: 0 }])}>
            + Variant
          </button>
        )}

        {adjustment.variantId && (
          <div style={{ borderTop: '1px solid var(--golvia-border)', marginTop: 14, paddingTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>
              Adjust stock — {adjustingVariant?.variant_label} (now {adjustingVariant?.quantity})
            </h3>
            <div className="golvia-toolbar">
              <div className="golvia-field" style={{ marginBottom: 0 }}>
                <label htmlFor="adjust-delta">Change by</label>
                <input id="adjust-delta" type="number" value={adjustment.delta} placeholder="e.g. 5 or -2"
                  onChange={e => setAdjustment({ ...adjustment, delta: e.target.value })} style={{ width: 120 }} />
              </div>
              <div className="golvia-field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
                <label htmlFor="adjust-reason">Reason</label>
                <input id="adjust-reason" value={adjustment.reason} placeholder="Restock, damaged, recount…"
                  onChange={e => setAdjustment({ ...adjustment, reason: e.target.value })} style={{ width: '100%' }} />
              </div>
            </div>
            {previewQuantity !== null && (
              <p style={{ fontSize: 12, color: previewQuantity < 0 ? 'var(--golvia-danger)' : 'var(--golvia-text-muted)' }}>
                New quantity will be <strong className="golvia-num">{previewQuantity}</strong>
                {previewQuantity < 0 ? ' — that would take stock below zero.' : ''}
              </p>
            )}
            {adjustError && <p className="golvia-error">{adjustError}</p>}
            <div className="golvia-toolbar" style={{ marginBottom: 0 }}>
              <button className="golvia-btn-primary" onClick={submitAdjustment}>Apply adjustment</button>
              <button onClick={() => { setAdjustment(EMPTY_ADJUSTMENT); setAdjustError(''); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {saveError && <p className="golvia-error">{saveError}</p>}
      <button className="golvia-btn-primary" onClick={save}>Save</button>
    </div>
  );
}
