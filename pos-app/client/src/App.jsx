import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { apiClient } from './api/client';
import { animatePageIn } from './gsapMotion';
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

function AppShell({ user, onLogout }) {
  const location = useLocation();

  useEffect(() => { animatePageIn(); }, [location.pathname]);

  return (
    <div>
      <nav className="golvia-nav">
        <span className="golvia-brand">GOLVIA</span>
        <div className="golvia-links">
          <Link to="/">Checkout</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/products">Products</Link>
          <Link to="/customers">Customers</Link>
          <Link to="/invoices">Sales</Link>
          <Link to="/marketing">Marketing</Link>
          <Link to="/settings">Settings</Link>
        </div>
        <div className="golvia-user">
          <span>{user.username}</span>
          <button onClick={onLogout}>Logout</button>
        </div>
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
  );
}

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
      <AppShell user={user} onLogout={handleLogout} />
    </BrowserRouter>
  );
}
