import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { loadEnv } from '@infrastructure/config/env';

const router = Router();

const MAX_DIMENSION = 1920;
const QUALITY = 80;

const storage = multer.diskStorage({
  destination: path.join(process.cwd(), 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomBytes(16).toString('hex');
    cb(null, `${name}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max input
  },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, png, gif, webp) are allowed'));
    }
  },
});

async function processImage(
  inputPath: string,
  outputPath: string,
  filename: string
): Promise<void> {
  const ext = path.extname(filename).toLowerCase();

  const image = sharp(inputPath);
  const metadata = await image.metadata();

  let processed;
  if (metadata.width && metadata.width > MAX_DIMENSION) {
    processed = image.resize({ width: MAX_DIMENSION, withoutEnlargement: true });
  } else {
    processed = image;
  }

  // Convert to WebP for better compression, or keep original format
  if (ext === '.png') {
    await processed.png({ quality: QUALITY }).toFile(outputPath.replace(ext, '.webp'));
  } else if (ext === '.jpg' || ext === '.jpeg') {
    await processed.jpeg({ quality: QUALITY }).toFile(outputPath.replace(ext, '.jpg'));
  } else if (ext === '.gif') {
    await processed.gif().toFile(outputPath);
  } else if (ext === '.webp') {
    await processed.webp({ quality: QUALITY }).toFile(outputPath);
  }
}

const uploadHandler: RequestHandler = upload.single('image');

router.post('/upload', (req, res, next) => {
  uploadHandler(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    try {
      const env = loadEnv();
      const ext = path.extname(req.file.filename).toLowerCase();
      const baseName = req.file.filename.replace(ext, '');
      const finalFilename = ext === '.png' ? `${baseName}.webp` : req.file.filename.replace(ext, `.compressed${ext}`);
      const outputPath = path.join(process.cwd(), 'public', 'uploads', finalFilename);

      await processImage(req.file.path, outputPath, req.file.filename);

      // Remove original file after processing
      const fs = await import('fs');
      fs.unlinkSync(req.file.path);

      const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
      const url = `${baseUrl}/uploads/${finalFilename}`;

      res.json({ url, filename: finalFilename });
    } catch (error) {
      res.status(500).json({ error: 'Failed to process image' });
    }
  });
});

export default router;