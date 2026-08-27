import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { apiClient } from './api/client';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Checkout from './pages/Checkout';
import Products from './pages/Products';
import ProductForm from './pages/ProductForm';
import Customers from './pages/Customers';
import CustomerProfile from './pages/CustomerProfile';
import Invoices from './pages/Invoices';
import InvoiceReceipt from './pages/InvoiceReceipt';
import Marketing from './pages/Marketing';
import Settings from './pages/Settings';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    apiClient.get('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <p>Loading...</p>;
  if (user === null) return <Login onLoggedIn={setUser} />;

  async function handleLogout() {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }

  return (
    <BrowserRouter>
      <div>
        <nav>
          <Link to="/">Checkout</Link>
          {' | '}
          <Link to="/dashboard">Dashboard</Link>
          {' | '}
          <Link to="/products">Products</Link>
          {' | '}
          <Link to="/customers">Customers</Link>
          {' | '}
          <Link to="/invoices">Sales</Link>
          {' | '}
          <Link to="/marketing">Marketing</Link>
          {' | '}
          <Link to="/settings">Settings</Link>
          {' — '}
          <span>{user.username}</span>
          {' '}
          <button onClick={handleLogout}>Logout</button>
        </nav>
        <Routes>
          <Route path="/" element={<Checkout />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductForm />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerProfile />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:id/receipt" element={<InvoiceReceipt />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
