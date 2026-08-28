import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function ProductForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', category: '', brand: '', description: '', image_url: '' });
  const [variants, setVariants] = useState([{ variant_label: '', sku: '', cost_price: 0, sell_price: 0, quantity: 0 }]);

  useEffect(() => {
    if (!isNew) apiClient.get(`/products/${id}`).then(p => { setForm(p); setVariants(p.variants); });
  }, [id]);

  function updateVariant(idx, field, value) {
    setVariants(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  }

  async function save() {
    if (isNew) {
      await apiClient.post('/products', { ...form, variants });
    } else {
      await apiClient.put(`/products/${id}`, {
        ...form,
        variants: variants.map(v => ({ id: v.id, cost_price: v.cost_price, sell_price: v.sell_price })),
      });
    }
    navigate('/products');
  }

  async function adjustStock(variantId) {
    const delta = Number(prompt('Quantity change (e.g. 5 or -2):'));
    const reason = prompt('Reason:');
    if (!reason || !reason.trim()) return alert('Reason is required.');
    try {
      await apiClient.post(`/products/${id}/variants/${variantId}/adjust-stock`, { delta, reason });
      apiClient.get(`/products/${id}`).then(p => setVariants(p.variants));
    } catch (err) {
      alert(err.data?.error === 'REASON_REQUIRED' ? 'A reason is required for stock adjustments.' : (err.data?.error || err.message || 'Stock adjustment failed.'));
    }
  }

  return (
    <div className="golvia-page">
      <h2>{isNew ? 'New Product' : 'Edit Product'}</h2>

      <div className="golvia-card" style={{ display: 'flex', gap: 20 }}>
        <div>
          {form.image_url
            ? <img className="golvia-thumb-lg" src={form.image_url} alt="" />
            : <div className="golvia-thumb-lg" />}
        </div>
        <div style={{ flex: 1 }}>
          <div className="golvia-field"><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label>Category</label><input value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label>Brand</label><input value={form.brand || ''} onChange={e => setForm({ ...form, brand: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label>Image URL</label><input value={form.image_url || ''} onChange={e => setForm({ ...form, image_url: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label>Description</label><textarea value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} style={{ width: '100%' }} /></div>
        </div>
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Variants</h3>
        {variants.map((v, idx) => (
          <div key={idx} className="golvia-toolbar">
            <input placeholder="Label" value={v.variant_label} onChange={e => updateVariant(idx, 'variant_label', e.target.value)} />
            <input placeholder="SKU" value={v.sku} onChange={e => updateVariant(idx, 'sku', e.target.value)} />
            <input placeholder="Cost" type="number" value={v.cost_price} onChange={e => updateVariant(idx, 'cost_price', Number(e.target.value))} />
            <input placeholder="Price" type="number" value={v.sell_price} onChange={e => updateVariant(idx, 'sell_price', Number(e.target.value))} />
            <input placeholder="Qty" type="number" value={v.quantity} readOnly={!isNew}
              title={!isNew ? 'Use Adjust stock to change quantity' : undefined}
              onChange={e => isNew && updateVariant(idx, 'quantity', Number(e.target.value))} />
            {!isNew && <span style={{ fontSize: 11, color: 'var(--golvia-text-muted)' }}>use Adjust stock to change quantity</span>}
            {!isNew && v.id && <button onClick={() => adjustStock(v.id)}>Adjust stock</button>}
          </div>
        ))}
        {isNew && <button onClick={() => setVariants([...variants, { variant_label: '', sku: '', cost_price: 0, sell_price: 0, quantity: 0 }])}>+ Variant</button>}
      </div>

      <button className="golvia-btn-primary" onClick={save}>Save</button>
    </div>
  );
}
