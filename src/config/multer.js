const path           = require("path");
const fs             = require("fs");
const multer         = require("multer");
const { randomUUID } = require("crypto");

const MAX_PROFILE_SIZE = 2 * 1024 * 1024;

const PROFILE_UPLOAD_DIR = path.join(process.cwd(), "public", "profile_pictures");

if (!fs.existsSync(PROFILE_UPLOAD_DIR)) fs.mkdirSync(PROFILE_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PROFILE_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `pro-pic-${randomUUID()}-${Date.now()}${ext}`);
  },
});

const uploadProfilePicture = multer({
  storage,
  limits: { fileSize: MAX_PROFILE_SIZE },
});

module.exports = { uploadProfilePicture };