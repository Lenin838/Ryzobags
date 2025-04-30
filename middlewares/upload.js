const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const util = require('util');

const mkdir = util.promisify(fs.mkdir);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const multerUpload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: fileFilter
});

const resizeAndSaveImages = async (files) => {
  if (!files || !Array.isArray(files)) {
    console.error('Invalid files input:', files);
    return [];
  }

  console.log(`Processing ${files.length} images`);
  
  const outputDir = path.resolve(process.cwd(), 'public/images/products');
   await mkdir(outputDir, { recursive: true });
  
  const results = await Promise.all(
    files.map(async (file, index) => {
      try {
        if (!file || !file.buffer) {
          console.error(`File at index ${index} is invalid:`, file);
          return null;
        }
        
        const filename = `product-${Date.now()}-${index}.jpg`;

        const outputPath = path.join(outputDir, filename);
        
        console.log(`Processing image ${index}: ${filename}`);
        
        await sharp(file.buffer)
        .resize(800, 800)
        .toFormat("jpeg")
        .jpeg({ quality: 90 })
        .toFile(`public/images/products/${filename}`);
        
        return `/images/products/${filename}`;
      } catch (err) {
        console.error(`Error processing image ${index}:`, err);
        return null;
      }
    })
  );
  
  const validResults = results.filter(url => url !== null);
  console.log(`Successfully processed ${validResults.length} images out of ${files.length}`);
  
  return validResults;
};

module.exports = {
  multerUpload,
  resizeAndSaveImages
};