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
        WHERE p.name LIKE ? OR p.category LIKE ? OR v.sku LIKE ?
      `).all(like, like, like);
      products = rows;
    } else {
      products = db.prepare('SELECT * FROM products').all();
    }
    res.json(products.map(withVariants));
  });

  router.get('/lookup', (req, res) => {
    const { sku } = req.query;
    const variant = db.prepare('SELECT * FROM product_variants WHERE sku = ?').get(sku);
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
        INSERT INTO product_variants (product_id, variant_label, sku, cost_price, sell_price, quantity, low_stock_threshold)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const v of variants) {
        insertVariant.run(productId, v.variant_label, v.sku, v.cost_price, v.sell_price, v.quantity, v.low_stock_threshold ?? 3);
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
          UPDATE product_variants SET cost_price = ?, sell_price = ? WHERE id = ? AND product_id = ?
        `);
        for (const v of variants) {
          updateVariant.run(v.cost_price, v.sell_price, v.id, req.params.id);
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
