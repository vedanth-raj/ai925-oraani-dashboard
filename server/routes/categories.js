const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken, requireAdmin, requireAdminOrBusinessAdmin, logAudit } = require('../middleware/auth');

// GET /api/categories
router.get('/', authenticateToken, (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.status != 'archived'
    WHERE c.is_archived = 0
    GROUP BY c.id
    ORDER BY c.created_at ASC
  `).all();

  res.json({ categories });
});

// POST /api/categories (System & Business Admin; also used by "+ New category" in the product form)
router.post('/', authenticateToken, requireAdminOrBusinessAdmin, (req, res) => {
  const { name, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const trimmed = name.trim();
  const existing = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(trimmed);
  if (existing) {
    return res.status(400).json({ error: 'A category with this name already exists' });
  }

  const id = 'cat_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO categories (id, name, description, is_archived, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(id, trimmed, description || '', now, now);

  logAudit(req.user.id, 'CREATE_CATEGORY', 'categories', id, `Created category: ${trimmed}`, req);

  const newCat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.status(201).json({ category: newCat });
});

// DELETE /api/categories/:id (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) {
    return res.status(404).json({ error: 'Category not found' });
  }

  db.prepare('UPDATE categories SET is_archived = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  logAudit(req.user.id, 'ARCHIVE_CATEGORY', 'categories', id, `Archived category: ${category.name}`, req);

  res.json({ success: true, message: 'Category archived successfully' });
});

module.exports = router;
