const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

const allowedTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
]);

const upload = multer({
  // L'image est conservée brièvement en mémoire afin de ne jamais enregistrer
  // le fichier brut et potentiellement lourd sur le disque.
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    callback(allowedTypes.has(file.mimetype) ? null : new Error('Format d’image non pris en charge. Utilisez JPEG, PNG ou WebP.'), allowedTypes.has(file.mimetype));
  }
});

function productImageUpload(req, res, next) {
  upload.single('photo')(req, res, async (error) => {
    if (error) return next(error);
    if (!req.file) return next();

    const directory = path.join(__dirname, '../../uploads/products', String(req.user.id));
    const filename = `${crypto.randomUUID()}.webp`;
    const destination = path.join(directory, filename);

    try {
      await fs.promises.mkdir(directory, { recursive: true });
      await sharp(req.file.buffer)
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toFile(destination);
      req.file.filename = filename;
      req.file.path = destination;
      req.file.mimetype = 'image/webp';
      return next();
    } catch (processingError) {
      // Le type MIME est contrôlé par Multer, mais Sharp vérifie le contenu réel.
      // Une image corrompue ou usurpant son type doit être refusée comme une erreur client.
      processingError.status = 400;
      processingError.userMessage = 'Le fichier envoyé ne contient pas une image valide.';
      return next(processingError);
    }
  });
}

module.exports = { productImageUpload };
