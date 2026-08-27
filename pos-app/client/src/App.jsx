import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { apiClient } from './api/client';
import Login from './pages/Login';
import Checkout from './pages/Checkout';
import InvoiceReceipt from './pages/InvoiceReceipt';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    apiClient.get('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <p>Loading...</p>;
  if (user === null) return <Login onLoggedIn={setUser} />;

  return (
    <BrowserRouter>
      <div>
        <nav>
          <Link to="/">Checkout</Link>
          {' | '}
          <Link to="/products">Products</Link>
          {' | '}
          <Link to="/customers">Customers</Link>
          {' | '}
          <Link to="/invoices">Invoices</Link>
          {' | '}
          <Link to="/marketing">Marketing</Link>
          {' | '}
          <Link to="/settings">Settings</Link>
          {' — '}
          <span>{user.username}</span>
        </nav>
        <Routes>
          <Route path="/" element={<Checkout />} />
          <Route path="/invoices/:id/receipt" element={<InvoiceReceipt />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
