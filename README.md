# Connecteur-Alldebrid-Arr

Client de téléchargement pour Radarr, Sonarr, Lidarr, Readarr… qui fait passer les torrents par **AllDebrid** :

1. Radarr/Sonarr envoient le magnet (ou le `.torrent`) choisi au connecteur, comme à qBittorrent ;
2. le connecteur l'envoie à AllDebrid et attend qu'il soit disponible ;
3. les fichiers sont téléchargés en **HTTPS** dans `DOWNLOAD_DIR/<catégorie>/` (avec reprise en cas de coupure) ;
4. Radarr/Sonarr voient le téléchargement terminé et l'importent.

Le connecteur imite l'API Web de qBittorrent : aucun plugin n'est nécessaire côté *arr.

## Installation

Node.js 22 ou plus récent est requis.

```bash
npm install
```

Renseigner au minimum `ALLDEBRID_API_KEY` dans `.env` (modèle : `.env.example`). La clé se crée sur https://alldebrid.com/apikeys/.

## Lancement

- `npm run dev` : mode développement (redémarre à chaque modification)
- `npm run build` puis `npm start` : version compilée
- **F5** dans VS Code : lancement avec le débogueur

## Déploiement sur TrueNAS avec Dockhand

À chaque push sur `main`, GitHub Actions construit l'image et la publie sur `ghcr.io/hoang-long-np/connecteur-alldebrid-arr:latest` (voir `.github/workflows/docker.yml`). Dockhand se contente de la télécharger.

1. Si l'image est privée, ajouter le registre dans Dockhand : `ghcr.io`, utilisateur `hoang-long-np`, mot de passe = jeton GitHub **classique** avec la permission `read:packages`. Les jetons « fine-grained » ne fonctionnent pas avec ghcr.io.
2. Créer une stack classique (pas une stack Git) en collant le contenu de `compose.yaml`.
3. Renseigner les variables d'environnement de la stack (modèle : `stack.env.example`) :
   - `ALLDEBRID_API_KEY` : la clé API. Elle se saisit uniquement dans Dockhand, jamais dans le dépôt ;
   - `DOWNLOADS_HOST_PATH` : dossier de téléchargement sur le NAS (ex. `/mnt/tank/media/downloads`) ;
   - `DOWNLOADS_CONTAINER_PATH` : chemin de ce même dossier **tel que Radarr/Sonarr le voient**. Voir le stockage des apps TrueNAS (ex. `/media/downloads`). Ainsi, ils trouvent les fichiers sans *Remote Path Mapping* ;
   - `ARR_UID` / `ARR_GID` : même utilisateur que Radarr/Sonarr (568 pour les apps TrueNAS). Ces noms évitent un conflit avec les `PUID`/`PGID` propres au conteneur Dockhand.
4. Déployer, puis vérifier les logs du conteneur `alldebrid-arr` : `Connecté à AllDebrid : … (premium)`.

Pour une mise à jour, pousser sur GitHub, attendre la fin de l'action « Image Docker », puis redéployer la stack : la dernière image est téléchargée à chaque fois (`pull_policy: always`). L'état est conservé dans `<dossier de téléchargement>/.alldebrid-arr/`.

Radarr/Sonarr installés en apps TrueNAS joignent le connecteur par l'adresse IP du NAS (port `8090`).

## Configuration dans Radarr / Sonarr

*Settings → Download Clients → + → qBittorrent*

| Champ | Valeur |
| --- | --- |
| Host | adresse IP du NAS (ou de la machine qui fait tourner le connecteur) |
| Port | `8090` (variable `PORT`) |
| Username / Password | `QBIT_USERNAME` / `QBIT_PASSWORD` (laisser vide si pas de mot de passe) |
| Category | `radarr`, `tv-sonarr`… (un sous-dossier par catégorie) |

Cliquer sur **Test** puis enregistrer. Laisser *Completed Download Handling* activé. *Remove Completed* permet de supprimer les fichiers du dossier de téléchargement après l'import.

### Radarr/Sonarr sous Docker ou sur une autre machine

Le connecteur donne des chemins tels qu'il les voit (ex. `D:\Downloads\radarr\Film.2024`). Si Radarr/Sonarr voient ce dossier sous un autre chemin, il faut ajouter une correspondance dans *Settings → Download Clients → Remote Path Mappings* (ex. `D:\Downloads\` → `/downloads/`).

## Bon à savoir

- AllDebrid bloque les adresses IP de serveurs dédiés et de VPN : le connecteur doit tourner sur une connexion « domestique ».
- En cas d'échec (torrent introuvable, erreur AllDebrid…), l'élément passe en erreur dans la file de Radarr/Sonarr. La raison est affichée dans les logs du connecteur.
- L'état est sauvegardé dans `DATA_DIR/state.json` : après un redémarrage, les téléchargements reprennent là où ils en étaient.
