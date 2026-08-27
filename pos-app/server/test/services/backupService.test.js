const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runBackup } = require('../../src/services/backupService');

test('copies the db file into the backup dir with a dated filename', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'golvia-backup-'));
  const dbFile = path.join(tmpDir, 'golvia.db');
  fs.writeFileSync(dbFile, 'fake-db-contents');
  const backupDir = path.join(tmpDir, 'backups');

  const result = runBackup(dbFile, backupDir, new Date('2026-08-27'));
  assert.equal(result, path.join(backupDir, 'golvia-2026-08-27.sqlite'));
  assert.ok(fs.existsSync(result));
  assert.equal(fs.readFileSync(result, 'utf8'), 'fake-db-contents');
});

test('prunes backups older than 30 days', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'golvia-backup-'));
  const dbFile = path.join(tmpDir, 'golvia.db');
  fs.writeFileSync(dbFile, 'x');
  const backupDir = path.join(tmpDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const oldFile = path.join(backupDir, 'golvia-2020-01-01.sqlite');
  fs.writeFileSync(oldFile, 'old');

  runBackup(dbFile, backupDir, new Date('2026-08-27'));
  assert.equal(fs.existsSync(oldFile), false);
});
