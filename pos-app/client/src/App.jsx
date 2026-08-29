import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { apiClient } from './api/client';
import { animatePageIn } from './gsapMotion';
import Icon from './components/Icon';
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

// `end` marks a route that must match exactly -- without it, "/" would count as active on
// every page, since NavLink treats a path as active for all of its nested routes.
const NAV_ITEMS = [
  { to: '/', label: 'Checkout', icon: 'cart', end: true },
  { to: '/dashboard', label: 'Dashboard', icon: 'grid' },
  { to: '/products', label: 'Products', icon: 'package' },
  { to: '/customers', label: 'Customers', icon: 'users' },
  { to: '/invoices', label: 'Sales', icon: 'receipt' },
  { to: '/marketing', label: 'Marketing', icon: 'send' },
  { to: '/settings', label: 'Settings', icon: 'sliders' },
];

function pageTitle(pathname) {
  const match = NAV_ITEMS
    .filter(item => (item.end ? pathname === item.to : pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return match ? match.label : 'GOLVIA POS';
}

function AppShell({ user, onLogout }) {
  const location = useLocation();

  useEffect(() => { animatePageIn(); }, [location.pathname]);

  return (
    <div className="golvia-shell">
      <aside className="golvia-sidebar">
        <span className="golvia-brand">GOLVIA</span>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) => `golvia-navitem${isActive ? ' active' : ''}`}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </aside>

      <div className="golvia-main">
        <header className="golvia-topbar">
          <span className="golvia-topbar-title">{pageTitle(location.pathname)}</span>
          <div className="golvia-user">
            <span>{user.username}</span>
            <button onClick={onLogout}>Logout</button>
          </div>
        </header>

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
