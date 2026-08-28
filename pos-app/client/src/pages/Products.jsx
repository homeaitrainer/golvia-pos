import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

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
      <table>
        <thead><tr><th></th><th>Name</th><th>Category</th><th>Variants</th></tr></thead>
        <tbody>
          {products.map(p => (
            <tr key={p.id}>
              <td style={{ width: 50 }}>
                {p.image_url ? <img className="golvia-thumb" src={p.image_url} alt="" /> : <span className="golvia-thumb" />}
              </td>
              <td><Link to={`/products/${p.id}`}>{p.name}</Link></td>
              <td>{p.category}</td>
              <td>{p.variants.map(v => `${v.variant_label} (${v.quantity})`).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {products.length === 0 && <p className="golvia-empty">No products found.</p>}
    </div>
  );
}
