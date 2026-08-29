import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Settings() {
  const [settings, setSettings] = useState({});
  // gmail_app_password is a write-only secret: the server never returns the saved value, so
  // this field always loads empty. Track what the user types this session separately so an
  // untouched field doesn't overwrite the stored password with an empty string on save.
  const [gmailAppPassword, setGmailAppPassword] = useState('');
  // A toast instead of alert(): a modal browser dialog blocks the whole page and has to be
  // dismissed, which is disproportionate feedback for "your settings saved".
  const [toast, setToast] = useState(null); // { text, isError }

  useEffect(() => { apiClient.get('/settings').then(setSettings); }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function save() {
    const body = { ...settings };
    delete body.gmail_app_password;
    if (gmailAppPassword) body.gmail_app_password = gmailAppPassword;
    try {
      await apiClient.put('/settings', body);
      setGmailAppPassword('');
      setToast({ text: 'Settings saved.' });
    } catch (err) {
      setToast({ text: err.data?.error || 'Could not save settings.', isError: true });
    }
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
    <div className="golvia-page">
      <h2>Settings</h2>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Email (Gmail)</h3>
        <div className="golvia-field"><label htmlFor="settings-gmail-address">Gmail address</label><input id="settings-gmail-address" value={settings.gmail_address || ''} onChange={e => setSettings({ ...settings, gmail_address: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field">
          <label htmlFor="settings-gmail-app-password">Gmail app password</label>
          <input id="settings-gmail-app-password" type="password" value={gmailAppPassword} placeholder="Leave blank to keep the current password" onChange={e => setGmailAppPassword(e.target.value)} style={{ width: '100%' }} />
        </div>
        <button className="golvia-btn-primary" onClick={save}>Save</button>
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Data export</h3>
        <button onClick={exportAll}>Export all data</button>
      </div>

      {toast && (
        <div className={`golvia-toast${toast.isError ? ' golvia-toast-error' : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
