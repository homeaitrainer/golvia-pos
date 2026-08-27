import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Settings() {
  const [settings, setSettings] = useState({});
  // gmail_app_password is a write-only secret: the server never returns the saved value, so
  // this field always loads empty. Track what the user types this session separately so an
  // untouched field doesn't overwrite the stored password with an empty string on save.
  const [gmailAppPassword, setGmailAppPassword] = useState('');

  useEffect(() => { apiClient.get('/settings').then(setSettings); }, []);

  async function save() {
    const body = { ...settings };
    delete body.gmail_app_password;
    if (gmailAppPassword) body.gmail_app_password = gmailAppPassword;
    await apiClient.put('/settings', body);
    alert('Saved.');
  }

  function downloadCsv(filename, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function exportAll() {
    const files = await apiClient.get('/export/all');
    for (const [filename, content] of Object.entries(files)) {
      downloadCsv(filename, content);
    }
  }

  return (
    <div>
      <h2>Settings</h2>
      <label>Gmail address: <input value={settings.gmail_address || ''} onChange={e => setSettings({ ...settings, gmail_address: e.target.value })} /></label>
      <label>Gmail app password: <input type="password" value={gmailAppPassword} placeholder="Leave blank to keep the current password" onChange={e => setGmailAppPassword(e.target.value)} /></label>
      <button onClick={save}>Save</button>

      <h3>Data export</h3>
      <button onClick={exportAll}>Export all data</button>
    </div>
  );
}
