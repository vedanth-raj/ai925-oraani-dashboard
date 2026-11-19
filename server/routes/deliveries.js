const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db } = require('../db/database');
const { authenticateToken, logAudit } = require('../middleware/auth');
const { uploadsSubdir, storeUploadedFile, removeUpload, imageFileFilter } = require('../utils/files');

const SHIPMENTS_DIR = uploadsSubdir('shipments');
const PACKAGES_DIR = uploadsSubdir('packages');
const BILLS_DIR = uploadsSubdir('bills');

// Files land under a temporary name; once image_type is known the handler moves them to the
// right folder named after the order number: "5005.jpg", then "5005-1.jpg", "5005-2.jpg", ...
const upload = multer({
  dest: SHIPMENTS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: imageFileFilter('order photos')
});

// POST /api/orders/:id/deliveries (Record Delivery / Shipment, matching Image 30)
router.post('/:id/deliveries', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { delivery_date, courier_name, tracking_number, notes, items } = req.body;
  const isRep = req.user.role === 'SALES_REP';

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Sales rep isolation
  if (isRep && order.creator_id !== req.user.id && order.sales_rep_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: You cannot record delivery for this order' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Please provide at least one item to deliver' });
  }

  const deliveryId = 'del_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  const delDate = delivery_date || now.split('T')[0];

  // Determine delivery number
  const lastDel = db.prepare('SELECT MAX(delivery_number) as max_num FROM deliveries WHERE order_id = ?').get(id);
  const deliveryNumber = (lastDel && lastDel.max_num ? lastDel.max_num : 0) + 1;

  let totalDeliveredPcs = 0;
  let totalDeliveredWeight = 0.0;

  const tx = db.transaction(() => {
    // Insert delivery record
    db.prepare(`
      INSERT INTO deliveries (
        id, order_id, delivery_number, delivery_date, courier_name,
        tracking_number, notes, dispatched_by_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deliveryId,
      id,
      deliveryNumber,
      delDate,
      courier_name || '',
      tracking_number || '',
      notes || '',
      req.user.id,
      now
    );

    const insertDeliveryItemStmt = db.prepare(`
      INSERT INTO delivery_items (id, delivery_id, order_item_id, delivered_pieces, actual_weight_g)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      const orderItem = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(item.order_item_id, id);
      if (!orderItem) {
        throw new Error(`Order item not found: ${item.order_item_id}`);
      }

      const deliveredPcs = parseInt(item.delivered_pieces, 10) || 0;
      const actualWeight = parseFloat(item.actual_weight_g) || 0.0;

      if (deliveredPcs <= 0) continue;

      const remainingPcs = orderItem.requested_pieces - orderItem.delivered_pieces;
      if (deliveredPcs > remainingPcs) {
        throw new Error(`Cannot deliver ${deliveredPcs} pcs. Only ${remainingPcs} pcs remain for this item.`);
      }

      totalDeliveredPcs += deliveredPcs;
      totalDeliveredWeight += actualWeight;

      // Insert delivery item
      const dItemId = 'deli_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
      insertDeliveryItemStmt.run(dItemId, deliveryId, orderItem.id, deliveredPcs, actualWeight);

      // Update order item delivered counts
      db.prepare(`
        UPDATE order_items SET
          delivered_pieces = delivered_pieces + ?,
          delivered_weight = delivered_weight + ?
        WHERE id = ?
      `).run(deliveredPcs, actualWeight, orderItem.id);

      // Inventory physical stock deduction and reserved stock reduction
      db.prepare(`
        UPDATE products SET
          physical_stock = MAX(0, physical_stock - ?),
          reserved_stock = MAX(0, reserved_stock - ?)
        WHERE id = ?
      `).run(deliveredPcs, deliveredPcs, orderItem.product_id);

      // Log movement ledger
      db.prepare(`
        INSERT INTO inventory_movements (id, product_id, change_qty, movement_type, reason, related_order_id, user_id, created_at)
        VALUES (?, ?, ?, 'DISPATCH', ?, ?, ?, ?)
      `).run(
        'mov_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        orderItem.product_id,
        -deliveredPcs,
        `Dispatched Delivery ${deliveryNumber} for order ${order.order_number}`,
        id,
        req.user.id,
        now
      );
    }

    if (totalDeliveredPcs === 0) {
      throw new Error('Total delivered pieces must be greater than 0');
    }

    // Check if entire order is fully fulfilled
    const allItems = db.prepare('SELECT requested_pieces, delivered_pieces FROM order_items WHERE order_id = ?').all(id);
    const allFulfilled = allItems.every(i => i.delivered_pieces >= i.requested_pieces);

    const newStatus = allFulfilled ? 'CLOSED' : 'IN_PROGRESS';
    const newOpStatus = allFulfilled ? 'Fulfilled' : 'Partially fulfilled';

    db.prepare(`
      UPDATE orders SET
        delivered_pieces = delivered_pieces + ?,
        delivered_weight = delivered_weight + ?,
        status = ?,
        operational_status = ?,
        closed_at = CASE WHEN ? = 'CLOSED' THEN ? ELSE closed_at END,
        closed_by_id = CASE WHEN ? = 'CLOSED' THEN ? ELSE closed_by_id END,
        updated_at = ?
      WHERE id = ?
    `).run(
      totalDeliveredPcs,
      parseFloat(totalDeliveredWeight.toFixed(2)),
      newStatus,
      newOpStatus,
      newStatus,
      now,
      newStatus,
      req.user.id,
      now,
      id
    );
  });

  try {
    tx();
    logAudit(req.user.id, 'RECORD_DELIVERY', 'deliveries', deliveryId, `Recorded Delivery ${deliveryNumber} for order ${order.order_number} (${totalDeliveredPcs} pcs, ${totalDeliveredWeight}g)`, req);
    res.status(201).json({ success: true, deliveryId, message: 'Delivery recorded successfully' });
  } catch (err) {
    console.error('Record delivery failed:', err);
    res.status(400).json({ error: err.message || 'Failed to record delivery' });
  }
});

// POST /api/orders/:id/shipment-images (Upload courier receipt or package photo)
router.post('/:id/shipment-images', authenticateToken, upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { delivery_id, caption } = req.body;
  const isRep = req.user.role === 'SALES_REP';

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) {
    if (req.file) removeUpload('/uploads/shipments/' + req.file.filename);
    return res.status(404).json({ error: 'Order not found' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Please choose an image file to upload' });
  }

  if (isRep && order.creator_id !== req.user.id && order.sales_rep_id !== req.user.id) {
    removeUpload('/uploads/shipments/' + req.file.filename);
    return res.status(403).json({ error: 'Access denied: You cannot upload images for this order' });
  }

  const rawType = (req.body.image_type || req.query.image_type || 'shipment').toLowerCase();
  const typeLabel = rawType.includes('package') ? 'package' : rawType.includes('bill') ? 'bill' : 'shipment';
  const targetDir = typeLabel === 'package' ? PACKAGES_DIR : typeLabel === 'bill' ? BILLS_DIR : SHIPMENTS_DIR;

  const imageId = 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const relativePath = storeUploadedFile(req.file, targetDir, order.order_number);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO shipment_images (
      id, order_id, delivery_id, file_path, original_filename,
      mime_type, file_size, caption, image_type, uploaded_by_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    imageId,
    id,
    delivery_id || null,
    relativePath,
    req.file.originalname,
    req.file.mimetype,
    req.file.size,
    caption || '',
    typeLabel,
    req.user.id,
    now
  );

  logAudit(req.user.id, 'UPLOAD_IMAGE', 'shipment_images', imageId, `Uploaded ${typeLabel} image for order ${order.order_number}`, req);

  const created = db.prepare('SELECT * FROM shipment_images WHERE id = ?').get(imageId);
  res.status(201).json({ image: created });
});

// DELETE /api/orders/:id/shipment-images/:imageId
router.delete('/:id/shipment-images/:imageId', authenticateToken, (req, res) => {
  const { id, imageId } = req.params;
  const isRep = req.user.role === 'SALES_REP';

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (isRep && order.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const image = db.prepare('SELECT * FROM shipment_images WHERE id = ? AND order_id = ?').get(imageId, id);
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }

  // Delete file from disk safely
  removeUpload(image.file_path);

  db.prepare('DELETE FROM shipment_images WHERE id = ?').run(imageId);
  logAudit(req.user.id, 'DELETE_IMAGE', 'shipment_images', imageId, `Deleted shipment image ${imageId}`, req);

  res.json({ success: true, message: 'Image deleted successfully' });
});

module.exports = router;
