const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { deriveShortName } = require('../services/importStock');

function productsRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  function withVariants(product) {
    const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(product.id);
    return { ...product, variants };
  }

  router.get('/', (req, res) => {
    const { search } = req.query;
    let products;
    if (search) {
      const like = `%${search}%`;
      const rows = db.prepare(`
        SELECT DISTINCT p.* FROM products p
        LEFT JOIN product_variants v ON v.product_id = p.id
        WHERE p.name LIKE ? OR p.short_name LIKE ? OR p.category LIKE ? OR v.sku LIKE ? OR v.barcode LIKE ?
      `).all(like, like, like, like, like);
      products = rows;
    } else {
      products = db.prepare('SELECT * FROM products').all();
    }
    res.json(products.map(withVariants));
  });

  // Scan/manual lookup. Matches a barcode OR a SKU, because the two are different things here:
  // the imported SKUs are human-typed marketplace codes, while a scanner reads whatever is
  // encoded on the physical label. Matching is trimmed and case-insensitive -- scanners can emit
  // surrounding whitespace, and a hand-typed SKU won't reproduce the source data's mixed casing
  // ("CINCIN-aurora 0040"). Barcode is checked first: it is the machine-read identifier, so on the
  // (unlikely) chance a code exists as both, the scanned one wins.
  router.get('/lookup', (req, res) => {
    const code = String(req.query.sku ?? req.query.code ?? '').trim();
    if (!code) return res.status(404).json({ error: 'NOT_FOUND' });

    const variant =
      db.prepare(`
        SELECT * FROM product_variants
        WHERE barcode IS NOT NULL AND barcode <> '' AND UPPER(TRIM(barcode)) = UPPER(?)
      `).get(code)
      || db.prepare('SELECT * FROM product_variants WHERE UPPER(TRIM(sku)) = UPPER(?)').get(code);

    if (!variant) return res.status(404).json({ error: 'NOT_FOUND' });
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(variant.product_id);
    res.json({ product, variant });
  });

  router.get('/:id', (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(withVariants(product));
  });

  router.post('/', (req, res) => {
    const { name, short_name, category, description, brand, image_url, variants = [] } = req.body;
    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO products (name, short_name, category, description, brand, image_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(name, short_name || deriveShortName(name), category, description, brand, image_url);
      const productId = result.lastInsertRowid;
      const insertVariant = db.prepare(`
        INSERT INTO product_variants (product_id, variant_label, sku, barcode, cost_price, sell_price, quantity, low_stock_threshold)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const v of variants) {
        insertVariant.run(productId, v.variant_label, v.sku, v.barcode || null, v.cost_price, v.sell_price, v.quantity, v.low_stock_threshold ?? 3);
      }
      return productId;
    });
    const productId = tx();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    res.status(201).json(withVariants(product));
  });

  router.put('/:id', (req, res) => {
    const { name, short_name, category, description, brand, image_url, variants } = req.body;
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE products SET name = ?, short_name = ?, category = ?, description = ?, brand = ?, image_url = ?
        WHERE id = ?
      `).run(name, short_name || deriveShortName(name), category, description, brand, image_url, req.params.id);

      // Variant price/cost edits only -- quantity is intentionally excluded here so the
      // audited adjust-stock endpoint below remains the sole path for quantity changes.
      // Binding both id AND product_id prevents this from touching a variant belonging to
      // a different product.
      if (Array.isArray(variants)) {
        const updateVariant = db.prepare(`
          UPDATE product_variants SET cost_price = ?, sell_price = ?, barcode = ? WHERE id = ? AND product_id = ?
        `);
        for (const v of variants) {
          updateVariant.run(v.cost_price, v.sell_price, v.barcode || null, v.id, req.params.id);
        }
      }
    });
    tx();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(withVariants(product));
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(req.params.id);
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/:id/variants/:variantId/adjust-stock', (req, res) => {
    const { delta, reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'REASON_REQUIRED' });
    }
    const tx = db.transaction(() => {
      db.prepare('UPDATE product_variants SET quantity = quantity + ? WHERE id = ?').run(delta, req.params.variantId);
      db.prepare(`
        INSERT INTO stock_adjustments (variant_id, delta, reason) VALUES (?, ?, ?)
      `).run(req.params.variantId, delta, reason);
    });
    tx();
    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(req.params.variantId);
    res.json(variant);
  });

  return router;
}

module.exports = { productsRouter };
