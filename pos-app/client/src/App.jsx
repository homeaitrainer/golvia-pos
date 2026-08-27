import { useEffect, useState } from 'react';
import { apiClient } from './api/client';
import Login from './pages/Login';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    apiClient.get('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <p>Loading...</p>;
  if (user === null) return <Login onLoggedIn={setUser} />;

  return (
    <div>
      <h1>Welcome, {user.username}</h1>
      <p>POS shell — pages added in later tasks.</p>
    </div>
  );
}
