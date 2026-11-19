const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, DATA_DIR } = require('../db/database');
const { authenticateToken, requireAdminOrBusinessAdmin, logAudit } = require('../middleware/auth');

// Store private cloud files in data/cloud_drive (completely outside public uploads folder)
const CLOUD_STORAGE_DIR = path.join(DATA_DIR, 'cloud_drive');
if (!fs.existsSync(CLOUD_STORAGE_DIR)) {
  fs.mkdirSync(CLOUD_STORAGE_DIR, { recursive: true });
}

// Multer storage for private cloud files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, CLOUD_STORAGE_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = 'cld_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + ext;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per file
});

// All cloud routes require System Admin or Business Admin
router.use(authenticateToken);
router.use(requireAdminOrBusinessAdmin);

// GET /api/cloud/folders (List folders, optionally by parent_id)
router.get('/folders', (req, res) => {
  try {
    const rawParent = req.query.parent_id;
    const cleanParentId = (rawParent && rawParent !== 'null' && rawParent !== 'undefined' && String(rawParent).trim()) ? String(rawParent).trim() : null;

    let query = 'SELECT * FROM cloud_folders WHERE ';
    let params = [];

    if (cleanParentId) {
      query += 'parent_id = ?';
      params.push(cleanParentId);
    } else {
      query += 'parent_id IS NULL';
    }

    query += ' ORDER BY name ASC';
    const folders = db.prepare(query).all(...params);

    for (const f of folders) {
      f.file_count = db.prepare('SELECT COUNT(*) as c FROM cloud_files WHERE folder_id = ?').get(f.id).c;
      f.subfolder_count = db.prepare('SELECT COUNT(*) as c FROM cloud_folders WHERE parent_id = ?').get(f.id).c;
    }

    let currentFolder = null;
    if (cleanParentId) {
      currentFolder = db.prepare('SELECT * FROM cloud_folders WHERE id = ?').get(cleanParentId) || null;
    }

    res.json({ folders, currentFolder });
  } catch (err) {
    console.error('Failed to list cloud folders:', err);
    res.status(500).json({ error: 'Failed to retrieve cloud folders: ' + err.message });
  }
});

// POST /api/cloud/folders (Create Folder)
router.post('/folders', (req, res) => {
  try {
    const { name, parent_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const cleanParentId = (parent_id && parent_id !== 'null' && parent_id !== 'undefined' && String(parent_id).trim()) ? String(parent_id).trim() : null;

    if (cleanParentId) {
      const parentExists = db.prepare('SELECT id FROM cloud_folders WHERE id = ?').get(cleanParentId);
      if (!parentExists) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
    }

    const id = 'fld_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO cloud_folders (id, name, parent_id, created_by_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name.trim(), cleanParentId, req.user.id, now);

    logAudit(req.user.id, 'CREATE_CLOUD_FOLDER', 'cloud_folders', id, `Created cloud folder: ${name.trim()}`, req);

    const created = db.prepare('SELECT * FROM cloud_folders WHERE id = ?').get(id);
    res.status(201).json({ folder: created, message: 'Folder created successfully' });
  } catch (err) {
    console.error('Failed to create cloud folder:', err);
    res.status(500).json({ error: 'Failed to create folder: ' + err.message });
  }
});

// PUT /api/cloud/folders/:id (Rename Folder)
router.put('/folders/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Folder name is required' });
  }

  const folder = db.prepare('SELECT * FROM cloud_folders WHERE id = ?').get(id);
  if (!folder) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  db.prepare('UPDATE cloud_folders SET name = ? WHERE id = ?').run(name.trim(), id);

  logAudit(req.user.id, 'RENAME_CLOUD_FOLDER', 'cloud_folders', id, `Renamed folder "${folder.name}" to "${name.trim()}"`, req);

  res.json({ success: true, message: 'Folder renamed successfully' });
});

// DELETE /api/cloud/folders/:id (Delete Folder and contents)
router.delete('/folders/:id', (req, res) => {
  const { id } = req.params;
  const folder = db.prepare('SELECT * FROM cloud_folders WHERE id = ?').get(id);
  if (!folder) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  // Recursively collect all descendant folder IDs to delete physical files
  const getAllDescendantFolderIds = (parentFolderId) => {
    const ids = [parentFolderId];
    const subfolders = db.prepare('SELECT id FROM cloud_folders WHERE parent_id = ?').all(parentFolderId);
    for (const sub of subfolders) {
      ids.push(...getAllDescendantFolderIds(sub.id));
    }
    return ids;
  };

  const allFolderIds = getAllDescendantFolderIds(id);
  for (const fId of allFolderIds) {
    const files = db.prepare('SELECT file_path FROM cloud_files WHERE folder_id = ?').all(fId);
    for (const f of files) {
      if (f.file_path && fs.existsSync(f.file_path)) {
        try { fs.unlinkSync(f.file_path); } catch (_) {}
      }
    }
  }

  db.prepare('DELETE FROM cloud_folders WHERE id = ?').run(id);

  logAudit(req.user.id, 'DELETE_CLOUD_FOLDER', 'cloud_folders', id, `Deleted cloud folder "${folder.name}"`, req);

  res.json({ success: true, message: `Folder "${folder.name}" deleted successfully` });
});

// GET /api/cloud/files (List files in folder)
router.get('/files', (req, res) => {
  const rawFolder = req.query.folder_id;
  const cleanFolderId = (rawFolder && rawFolder !== 'null' && rawFolder !== 'undefined' && String(rawFolder).trim()) ? String(rawFolder).trim() : null;

  let query = `
    SELECT 
      f.*,
      u.full_name as uploaded_by_name
    FROM cloud_files f
    LEFT JOIN users u ON f.uploaded_by_id = u.id
    WHERE 
  `;
  let params = [];

  if (cleanFolderId) {
    query += 'f.folder_id = ?';
    params.push(cleanFolderId);
  } else {
    query += 'f.folder_id IS NULL';
  }

  query += ' ORDER BY f.created_at DESC';
  const files = db.prepare(query).all(...params);

  res.json({ files });
});

// POST /api/cloud/upload (Upload any file type)
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { folder_id } = req.body;
    const cleanFolderId = (folder_id && folder_id !== 'null' && folder_id !== 'undefined' && String(folder_id).trim()) ? String(folder_id).trim() : null;

    if (cleanFolderId) {
      const folderExists = db.prepare('SELECT id FROM cloud_folders WHERE id = ?').get(cleanFolderId);
      if (!folderExists) {
        return res.status(404).json({ error: 'Destination folder not found' });
      }
    }

    const id = 'cfile_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO cloud_files (
        id, folder_id, filename, original_name, file_path, file_size, mime_type, uploaded_by_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      cleanFolderId,
      req.file.filename,
      req.file.originalname,
      req.file.path,
      req.file.size,
      req.file.mimetype || 'application/octet-stream',
      req.user.id,
      now
    );

    logAudit(req.user.id, 'UPLOAD_CLOUD_FILE', 'cloud_files', id, `Uploaded file: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`, req);

    const created = db.prepare('SELECT * FROM cloud_files WHERE id = ?').get(id);
    res.status(201).json({ file: created, message: 'File uploaded successfully' });
  } catch (err) {
    console.error('Failed to upload cloud file:', err);
    res.status(500).json({ error: 'Failed to upload file: ' + err.message });
  }
});

// GET /api/cloud/files/:id/download (Download file or preview inline)
router.get('/files/:id/download', (req, res) => {
  const { id } = req.params;
  const file = db.prepare('SELECT * FROM cloud_files WHERE id = ?').get(id);

  if (!file || !fs.existsSync(file.file_path)) {
    return res.status(404).json({ error: 'File not found on server' });
  }

  logAudit(req.user.id, 'DOWNLOAD_CLOUD_FILE', 'cloud_files', id, `Downloaded file: ${file.original_name}`, req);

  if (req.query.inline === 'true' || req.query.inline === '1') {
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name)}"`);
    return res.sendFile(path.resolve(file.file_path));
  }

  res.download(file.file_path, file.original_name);
});

// DELETE /api/cloud/files/:id (Delete file)
router.delete('/files/:id', (req, res) => {
  const { id } = req.params;
  const file = db.prepare('SELECT * FROM cloud_files WHERE id = ?').get(id);

  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (file.file_path && fs.existsSync(file.file_path)) {
    try { fs.unlinkSync(file.file_path); } catch (_) {}
  }

  db.prepare('DELETE FROM cloud_files WHERE id = ?').run(id);

  logAudit(req.user.id, 'DELETE_CLOUD_FILE', 'cloud_files', id, `Deleted file: ${file.original_name}`, req);

  res.json({ success: true, message: `File "${file.original_name}" deleted successfully` });
});

module.exports = router;
