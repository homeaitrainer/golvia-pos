import { useState } from 'react';
import { apiClient } from '../api/client';

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const user = await apiClient.post('/auth/login', { username, password });
      onLoggedIn(user);
    } catch (err) {
      setError('Invalid username or password.');
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}>
      <form onSubmit={handleSubmit} className="golvia-card" style={{ width: 320 }}>
        <h1 style={{ textAlign: 'center', color: 'var(--golvia-accent-dark)', letterSpacing: 2 }}>GOLVIA POS</h1>
        <div className="golvia-field">
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div className="golvia-field">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%' }} />
        </div>
        {error && <p className="golvia-error">{error}</p>}
        <button type="submit" className="golvia-btn-primary" style={{ width: '100%' }}>Log in</button>
      </form>
    </div>
  );
}
