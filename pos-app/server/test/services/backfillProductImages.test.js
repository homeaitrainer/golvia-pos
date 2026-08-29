const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { backfillImageUrls } = require('../../src/services/backfillProductImages');

test('backfillImageUrls fills image_url only for products missing one', () => {
  const tmp = path.join(__dirname, `tmp-backfill-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  db.prepare(`INSERT INTO products (id, name, image_url) VALUES (1, 'Ring A', NULL)`).run();
  db.prepare(`INSERT INTO products (id, name, image_url) VALUES (2, 'Ring B', 'https://existing.com/b.jpg')`).run();

  const grouped = [
    { name: 'Ring A', image_url: 'https://example.com/a.jpg', variants: [] },
    { name: 'Ring B', image_url: 'https://example.com/b-new.jpg', variants: [] },
  ];
  const result = backfillImageUrls(db, grouped);

  assert.equal(result.updated, 1);
  assert.equal(db.prepare('SELECT image_url FROM products WHERE id = 1').get().image_url, 'https://example.com/a.jpg');
  assert.equal(db.prepare('SELECT image_url FROM products WHERE id = 2').get().image_url, 'https://existing.com/b.jpg');
  db.close(); fs.unlinkSync(tmp);
});

test('backfillShortNames fills only products missing a short_name', () => {
  const { backfillShortNames } = require('../../src/services/backfillProductImages');
  const tmp = path.join(__dirname, `tmp-backfill-short-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  db.prepare(`INSERT INTO products (id, name, short_name) VALUES (1, 'GOLVIA JEWELLERY Gelang Charm | Korean Style Women Bracelet', NULL)`).run();
  db.prepare(`INSERT INTO products (id, name, short_name) VALUES (2, 'GOLVIA JEWELLERY Rantai Luxury | Korean Style Women Necklace', 'Hand Edited Name')`).run();

  const result = backfillShortNames(db);

  assert.equal(result.updated, 1);
  assert.equal(db.prepare('SELECT short_name FROM products WHERE id = 1').get().short_name, 'Gelang Charm');
  // A name the shop edited by hand is never clobbered.
  assert.equal(db.prepare('SELECT short_name FROM products WHERE id = 2').get().short_name, 'Hand Edited Name');
  db.close(); fs.unlinkSync(tmp);
});
