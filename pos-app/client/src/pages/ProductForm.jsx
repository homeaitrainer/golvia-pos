import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function ProductForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', category: '', brand: '', description: '' });
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
      await apiClient.put(`/products/${id}`, form);
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
    <div>
      <h2>{isNew ? 'New Product' : 'Edit Product'}</h2>
      <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <input placeholder="Category" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} />
      <input placeholder="Brand" value={form.brand || ''} onChange={e => setForm({ ...form, brand: e.target.value })} />
      <textarea placeholder="Description" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />

      <h3>Variants</h3>
      {variants.map((v, idx) => (
        <div key={idx}>
          <input placeholder="Label" value={v.variant_label} onChange={e => updateVariant(idx, 'variant_label', e.target.value)} />
          <input placeholder="SKU" value={v.sku} onChange={e => updateVariant(idx, 'sku', e.target.value)} />
          <input placeholder="Cost" type="number" value={v.cost_price} onChange={e => updateVariant(idx, 'cost_price', Number(e.target.value))} />
          <input placeholder="Price" type="number" value={v.sell_price} onChange={e => updateVariant(idx, 'sell_price', Number(e.target.value))} />
          <input placeholder="Qty" type="number" value={v.quantity} onChange={e => updateVariant(idx, 'quantity', Number(e.target.value))} />
          {!isNew && v.id && <button onClick={() => adjustStock(v.id)}>Adjust stock</button>}
        </div>
      ))}
      {isNew && <button onClick={() => setVariants([...variants, { variant_label: '', sku: '', cost_price: 0, sell_price: 0, quantity: 0 }])}>+ Variant</button>}

      <button onClick={save}>Save</button>
    </div>
  );
}
