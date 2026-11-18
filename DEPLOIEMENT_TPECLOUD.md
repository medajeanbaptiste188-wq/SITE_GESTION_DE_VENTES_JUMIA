# Déploiement de Sellora sur TPECloud

Adresse prévue : `https://sellora.devsitwo.ci` (le `:` manque dans l'URL fournie).

## Prérequis indispensable

Dans cPanel, vérifiez que **Software > Setup Node.js App** est disponible. Cette application utilise Express/Node.js ; elle ne peut pas fonctionner sur un hébergement PHP/FTP seul. Si l'option est absente, demandez l'activation de Node.js à TPECloud.

## Mise en ligne

1. Dans cPanel, rattachez le domaine/sous-domaine `sellora.devsitwo.ci` puis activez AutoSSL.
2. Dans **Setup Node.js App**, créez l'application avec :
   - version Node.js : 20 ou plus récente ;
   - mode : Production ;
   - racine de l'application : un dossier hors de `public_html` si cPanel le permet (par exemple `sellora`) ;
   - fichier de démarrage : `app.js` ;
   - URL d'application : `https://sellora.devsitwo.ci/`.
3. Transférez dans cette racine uniquement les fichiers et dossiers indiqués ci-dessous.
4. Dans l'interface Node.js, renseignez les variables de `.env.production.example`. Utilisez les noms complets créés par cPanel pour `DB_NAME` et `DB_USER`. Ne renseignez pas `PORT` : cPanel le fournit.
5. Cliquez sur **Run NPM Install**, puis redémarrez l'application.
6. Dans phpMyAdmin, sélectionnez la nouvelle base puis importez `migrations/schema-production.sql`. Ce fichier est réservé à une base vide et mémorise les migrations déjà intégrées.
7. Testez `https://sellora.devsitwo.ci/api/health` : la réponse attendue est `{"status":"ok"}`. Testez aussi `https://sellora.devsitwo.ci/.env` : la réponse doit être 404.

## Fichiers à téléverser par FTP

Dans la racine de l'application (par exemple le dossier `sellora.devsitwo.ci`), téléversez :

- `app.js`
- `package.json`
- `package-lock.json`
- `index.html`
- `manifest.json`
- `service-worker.js`
- le dossier `css/`
- le dossier `js/`
- le dossier `icons/`
- le dossier `src/`
- le dossier `migrations/` — il permet à l'application de détecter aussi les
  nouvelles migrations SQL et de proposer l'actualisation aux utilisateurs ;
  exécutez ensuite la migration concernée dans la base de données.

Ne téléversez pas :

- `.env` — il contient des secrets ; renseignez les variables dans cPanel ;
- le dossier `uploads/`
- `node_modules/` — cPanel le crée avec **Run NPM Install** ;
- `tmp/` ;

## Après mise en ligne

- Créez le premier compte depuis le lien **Créer un compte** de l'écran de connexion.
- Vérifiez que le dossier `uploads/` est inscriptible par l'utilisateur Node.js (une image produit doit pouvoir être envoyée).
- Forcez HTTPS dans cPanel une fois le certificat AutoSSL actif.
- Exportez régulièrement la base depuis phpMyAdmin/cPanel. Ne téléversez ni votre `.env` local ni `node_modules`.

## En cas d'erreur 503 sur `/api/health`

Vérifiez le journal Node.js cPanel puis, dans cet ordre : `DB_HOST` (souvent `localhost`), le préfixe cPanel présent dans le nom de base et l'utilisateur, le mot de passe, et les privilèges de cet utilisateur sur la base.
