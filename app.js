require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const apiRouter = require('./src/routes');

const app = express();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
// Une sauvegarde complète peut contenir les photos des produits encodées dans le JSON.
app.use(express.json({ limit: '30mb' }));

// Seuls les fichiers publics du frontend sont servis : jamais la racine entière.
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/icons', express.static(path.join(__dirname, 'icons')));
// Les URL des photos comprennent un identifiant unique : elles peuvent être
// mises en cache un an sans risquer d'afficher une ancienne photo après édition.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '1y', immutable: true }));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));
app.get('/service-worker.js', (req, res) => res.sendFile(path.join(__dirname, 'service-worker.js')));

// Cette empreinte couvre tout ce qui est déployé avec l'application : interface,
// API et migrations. Ainsi, modifier ou ajouter un fichier SQL déclenche aussi
// la proposition d'actualisation dans les applications déjà installées.
const appVersionFiles = ['app.js', 'index.html', 'manifest.json', 'service-worker.js', 'package.json', 'package-lock.json'];
const appVersionDirectories = ['css', 'js', 'icons', 'src', 'migrations'];
function filesIn(directory) {
  const absoluteDirectory = path.join(__dirname, directory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(relativePath) : entry.isFile() ? [relativePath] : [];
  });
}
function appVersion() {
  const files = [...appVersionFiles.filter((file) => fs.existsSync(path.join(__dirname, file))), ...appVersionDirectories.flatMap(filesIn)].sort();
  const fingerprint = crypto.createHash('sha256');
  files.forEach((file) => {
    // Le chemin est inclus : l'ajout, la suppression ou le renommage d'un fichier
    // fait donc évoluer la version même si son contenu existe déjà ailleurs.
    fingerprint.update(file.replaceAll(path.sep, '/'));
    fingerprint.update('\0');
    fingerprint.update(fs.readFileSync(path.join(__dirname, file)));
    fingerprint.update('\0');
  });
  return fingerprint.digest('hex').slice(0, 16);
}
app.get('/api/app-version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ version: appVersion() });
});

app.use('/api', apiRouter);
// Le manifeste et le service worker demandent aussi explicitement /index.html.
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.use((req, res) => res.status(404).json({ message: 'Ressource introuvable.' }));
app.use((error, req, res, next) => {
  console.error('Erreur applicative :', error.message);
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'La sauvegarde est trop volumineuse (maximum 30 Mo).' });
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'L’image ne doit pas dépasser 5 Mo.' });
  if (error.message === 'Format d’image non pris en charge. Utilisez JPEG, PNG ou WebP.') return res.status(400).json({ message: error.message });
  if (error.status === 400 && error.userMessage) return res.status(400).json({ message: error.userMessage });
  return res.status(500).json({ message: 'Une erreur interne est survenue.' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Mes ventes écoute sur le port ${port}`));
