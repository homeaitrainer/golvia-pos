import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

// The old "Variants" cell printed every variant name and count comma-separated -- 30+ entries on
// some products, which is unreadable and buries the one thing that actually needs attention:
// what has run out. Summarise instead, and call out only the low/zero-stock ones.
function VariantSummary({ variants }) {
  const totalStock = variants.reduce((sum, v) => sum + v.quantity, 0);
  const out = variants.filter(v => v.quantity <= 0);
  const low = variants.filter(v => v.quantity > 0 && v.quantity <= v.low_stock_threshold);

  return (
    <div style={{ fontSize: 13 }}>
      <span className="golvia-num">{variants.length}</span> variant{variants.length === 1 ? '' : 's'}
      {' · '}
      <span className="golvia-num">{totalStock}</span> in stock
      {(out.length > 0 || low.length > 0) && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {out.map(v => (
            <span key={v.id} className="golvia-badge golvia-badge-refunded" title="Out of stock">
              {v.variant_label} · 0
            </span>
          ))}
          {low.map(v => (
            <span key={v.id} className="golvia-badge golvia-badge-low" title="Low stock">
              {v.variant_label} · {v.quantity}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');

  async function load(q = '') {
    setProducts(await apiClient.get(`/products${q ? `?search=${encodeURIComponent(q)}` : ''}`));
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="golvia-page">
      <h2>Products</h2>
      <div className="golvia-toolbar">
        <input placeholder="Search" value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }} />
        <Link to="/products/new" className="golvia-btn-primary">+ Add product</Link>
      </div>
      <div className="golvia-card">
        <table>
          <thead><tr><th></th><th>Name</th><th>Category</th><th>Stock</th></tr></thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id}>
                <td style={{ width: 50 }}>
                  {p.image_url ? <img className="golvia-thumb" src={p.image_url} alt="" /> : <span className="golvia-thumb" />}
                </td>
                <td><Link to={`/products/${p.id}`}>{p.short_name || p.name}</Link></td>
                <td>{p.category}</td>
                <td><VariantSummary variants={p.variants} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && <p className="golvia-empty">No products found.</p>}
      </div>
    </div>
  );
}
