const path = require('path');
const fs = require('fs');

// AI925_UPLOADS_DIR lets a test server write uploads outside the live folder
const UPLOADS_DIR = process.env.AI925_UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');

function uploadsSubdir(name) {
  const dir = path.join(UPLOADS_DIR, name);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// '/uploads/products/x.jpg' -> absolute path on disk (null for anything outside uploads)
function absFromRel(relPath) {
  if (!relPath || typeof relPath !== 'string' || !relPath.startsWith('/uploads/')) return null;
  const abs = path.normalize(path.join(UPLOADS_DIR, relPath.substring('/uploads/'.length)));
  if (!abs.startsWith(path.normalize(UPLOADS_DIR))) return null;
  return abs;
}

function relFromAbs(absPath) {
  return '/uploads/' + path.relative(UPLOADS_DIR, absPath).split(path.sep).join('/');
}

// "Gaurav & Co. Jewellers" -> "Gaurav_Co_Jewellers"
function safeBaseName(raw, fallback = 'file') {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^#/, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 60);
  return cleaned || fallback;
}

// First file is "<base>.ext", later ones "<base>-1.ext", "<base>-2.ext", ...
function uniqueFilePath(dir, base, ext) {
  let candidate = path.join(dir, `${base}${ext}`);
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${n}${ext}`);
    n++;
  }
  return candidate;
}

function extOf(filename, fallback = '.jpg') {
  const ext = path.extname(filename || '').toLowerCase();
  return /^\.[a-z0-9]{2,5}$/.test(ext) ? ext : fallback;
}

// Move a freshly uploaded multer file into `dir` named after `base`. Returns the '/uploads/...' path.
function storeUploadedFile(file, dir, base) {
  const target = uniqueFilePath(dir, safeBaseName(base), extOf(file.originalname || file.filename));
  fs.renameSync(file.path, target);
  return relFromAbs(target);
}

// Rename an already stored upload so its name follows `base` (e.g. when a company or product is renamed).
// Files already named "<base>.ext" or "<base>-N.ext" are left alone.
function ensureNamed(relPath, base) {
  const abs = absFromRel(relPath);
  if (!abs || !fs.existsSync(abs)) return relPath;
  const cleanBase = safeBaseName(base);
  const ext = path.extname(abs);
  const current = path.basename(abs, ext);
  const escaped = cleanBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^${escaped}(-\\d+)?$`).test(current)) return relPath;
  try {
    const target = uniqueFilePath(path.dirname(abs), cleanBase, ext);
    fs.renameSync(abs, target);
    return relFromAbs(target);
  } catch (err) {
    console.error('Failed to rename upload:', err.message);
    return relPath;
  }
}

function removeUpload(relPath) {
  const abs = absFromRel(relPath);
  try {
    if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (err) {
    console.error('Failed to remove upload:', err.message);
  }
}

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-matroska'];

function imageFileFilter(label) {
  return (req, file, cb) => {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error(`Only JPEG, PNG, WEBP and GIF image formats are allowed for ${label}`);
      err.status = 400;
      cb(err);
    }
  };
}

function videoFileFilter(label) {
  return (req, file, cb) => {
    if (VIDEO_MIME_TYPES.includes(file.mimetype) || (file.mimetype && file.mimetype.startsWith('video/'))) {
      cb(null, true);
    } else {
      const err = new Error(`Only MP4, WebM, and MOV video formats are allowed for ${label}`);
      err.status = 400;
      cb(err);
    }
  };
}

module.exports = {
  UPLOADS_DIR,
  uploadsSubdir,
  absFromRel,
  relFromAbs,
  safeBaseName,
  uniqueFilePath,
  storeUploadedFile,
  ensureNamed,
  removeUpload,
  imageFileFilter,
  videoFileFilter
};
