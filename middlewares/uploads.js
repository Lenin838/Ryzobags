const multer = require('multer');
const path = require('path');
const fs = require('fs');
const util = require('util');
const sharp = require('sharp');

const mkdir = util.promisify(fs.mkdir);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const saveUserImage = async (req, file) => {
  if (!file || !file.buffer) {
    console.error('Invalid file input:', file);
    return null;
  }

  try {
    const userId = req.session.user ? req.session.user._id : 'unknown';
    const uploadPath = path.join(process.cwd(), 'public/images/users');

    await mkdir(uploadPath, { recursive: true });

    let filename = `user-${userId}.jpg`;
    const existingFile = path.join(uploadPath, filename);

    if (fs.existsSync(existingFile)) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      filename = `user-${userId}-${uniqueSuffix}.jpg`;
    }

    const outputPath = path.join(uploadPath, filename);

    // Process image with Sharp (crop/resize/compress)
    await sharp(file.buffer)
      .resize(300, 300) // You can adjust this for your crop dimensions
      .jpeg({ quality: 80 }) // You can adjust quality
      .toFile(outputPath);

    return `/images/users/${filename}`;
  } catch (err) {
    console.error('Error saving user image:', err);
    return null;
  }
};

module.exports = {
  upload,
  saveUserImage
};
