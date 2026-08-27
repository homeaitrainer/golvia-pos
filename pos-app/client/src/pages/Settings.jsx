import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Settings() {
  const [settings, setSettings] = useState({});

  useEffect(() => { apiClient.get('/settings').then(setSettings); }, []);

  async function save() {
    await apiClient.put('/settings', settings);
    alert('Saved.');
  }

  return (
    <div>
      <h2>Settings</h2>
      <label>Gmail address: <input value={settings.gmail_address || ''} onChange={e => setSettings({ ...settings, gmail_address: e.target.value })} /></label>
      <label>Gmail app password: <input type="password" value={settings.gmail_app_password || ''} onChange={e => setSettings({ ...settings, gmail_app_password: e.target.value })} /></label>
      <button onClick={save}>Save</button>
    </div>
  );
}
