const fs = require('fs');
const path = require('path');

function runBackup(dbFilePath, backupDir, now = new Date()) {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const dateStr = now.toISOString().slice(0, 10);
  const dest = path.join(backupDir, `golvia-${dateStr}.sqlite`);
  fs.copyFileSync(dbFilePath, dest);

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  for (const file of fs.readdirSync(backupDir)) {
    const match = file.match(/^golvia-(\d{4}-\d{2}-\d{2})\.sqlite$/);
    if (!match) continue;
    const fileDate = new Date(match[1]);
    if (fileDate < cutoff) {
      fs.unlinkSync(path.join(backupDir, file));
    }
  }

  return dest;
}

module.exports = { runBackup };
