# Connecteur-Alldebrid-Arr

Client de téléchargement pour Radarr, Sonarr, Lidarr, Readarr… qui fait passer les torrents par **AllDebrid**.

1. L'application *arr envoie le magnet (ou le `.torrent`) choisi au connecteur, comme à qBittorrent.
2. Le connecteur le transmet à AllDebrid et attend qu'il soit disponible.
3. Les fichiers sont téléchargés en **HTTPS** dans `<dossier de téléchargement>/<catégorie>/`, avec reprise en cas de coupure.
4. L'application *arr voit le téléchargement terminé et l'importe.

Le connecteur imite l'API Web de qBittorrent : aucun plugin n'est nécessaire côté *arr.

## Prérequis

- Un compte AllDebrid **premium** et sa clé API (https://alldebrid.com/apikeys/).
- Une connexion « domestique » : AllDebrid bloque les adresses IP de serveurs dédiés et de VPN.
- Docker, ou Node.js 22+ pour une exécution sans conteneur.

## Déploiement avec Docker

### Image

À chaque push sur `main`, le workflow `.github/workflows/docker.yml` construit l'image et la publie sur GitHub Container Registry :

```
ghcr.io/<propriétaire-du-dépôt>/connecteur-alldebrid-arr:latest
```

Pour un fork, adapter la ligne `image:` de `compose.yaml`. L'image peut aussi être construite localement :

```bash
docker build -t connecteur-alldebrid-arr .
```

Si le paquet ghcr.io est privé, l'hôte Docker doit s'authentifier auprès de `ghcr.io` avec un jeton GitHub **classique** doté de la permission `read:packages`. Les jetons « fine-grained » ne sont pas acceptés par ghcr.io.

### Stack

`compose.yaml` est prêt à l'emploi (Docker Compose, Dockhand, Portainer…). Les valeurs se renseignent dans les variables d'environnement de la stack ; le modèle est `stack.env.example`.

| Variable | Rôle |
| --- | --- |
| `ALLDEBRID_API_KEY` | Clé API AllDebrid (obligatoire). À garder hors du dépôt. |
| `DOWNLOADS_HOST_PATH` | Dossier de téléchargement sur l'hôte (obligatoire). |
| `DOWNLOADS_CONTAINER_PATH` | Chemin de ce même dossier **dans les conteneurs *arr**. Le connecteur l'utilise à l'identique, ce qui évite les *Remote Path Mappings*. Défaut : `/downloads`. |
| `ARR_UID` / `ARR_GID` | Utilisateur et groupe des applications *arr, pour que les fichiers leur appartiennent. Défaut : `568` (utilisateur « apps » de TrueNAS). |
| `HOST_PORT` | Port exposé sur l'hôte. Défaut : `8090`. |
| `QBIT_USERNAME` / `QBIT_PASSWORD` | Identifiants demandés aux *arr. Mot de passe vide = pas d'authentification. |
| `ALLDEBRID_CLEANUP` | Retire le magnet d'AllDebrid une fois téléchargé ou supprimé. Défaut : `true`. |
| `MAX_CONCURRENT_DOWNLOADS` | Fichiers téléchargés en parallèle. Défaut : `3`. |
| `LOG_LEVEL` | `debug`, `info`, `warn` ou `error`. Défaut : `info`. |

`ARR_UID`/`ARR_GID` sont volontairement différents de `PUID`/`PGID` : certains gestionnaires de conteneurs (Dockhand par exemple) exécutent Compose avec leurs propres `PUID`/`PGID`, qui écraseraient ceux de la stack.

L'utilisateur `ARR_UID` doit pouvoir écrire dans le dossier de téléchargement. Au démarrage, le connecteur le vérifie et s'arrête avec un message explicite si ce n'est pas le cas.

Les logs du conteneur doivent afficher :

```
Téléchargements : /downloads — état : /downloads/.alldebrid-arr
Connecté à AllDebrid : <utilisateur> (premium)
API compatible qBittorrent sur http://0.0.0.0:8090
```

### Mise à jour

Pousser sur `main`, attendre la fin du workflow « Image Docker », puis redéployer la stack : `pull_policy: always` télécharge la dernière image.

## Configuration des applications *arr

*Settings → Download Clients → + → qBittorrent*

| Champ | Valeur |
| --- | --- |
| Host | adresse IP de la machine qui fait tourner le connecteur |
| Port | `8090` (ou `HOST_PORT`) |
| Username / Password | `QBIT_USERNAME` / `QBIT_PASSWORD`, vides si pas de mot de passe |
| Category | `radarr`, `tv-sonarr`… (un sous-dossier par catégorie) |

Cliquer sur **Test** puis enregistrer. Laisser *Completed Download Handling* activé ; *Remove Completed* supprime les fichiers du dossier de téléchargement après l'import.

Si les applications *arr voient le dossier de téléchargement sous un autre chemin que le connecteur, ajouter une correspondance dans *Settings → Download Clients → Remote Path Mappings*.

## Développement

```bash
npm install
```

Copier `.env.example` en `.env` et renseigner au minimum `ALLDEBRID_API_KEY`.

- `npm run dev` : lancement avec rechargement automatique
- `npm run build` puis `npm start` : version compilée
- `npm run package` : vérification des types et fichier unique `release/connecteur.mjs` (utilisé par le `Dockerfile`)
- **F5** dans VS Code : lancement avec le débogueur

| Fichier | Rôle |
| --- | --- |
| `src/qbittorrent.ts` | API compatible qBittorrent exposée aux *arr |
| `src/manager.ts` | Cycle de vie d'un téléchargement |
| `src/alldebrid.ts` | Client de l'API AllDebrid |
| `src/downloader.ts` | Téléchargement HTTPS avec reprise |
| `src/store.ts` | Sauvegarde de l'état |

## Bon à savoir

- En cas d'échec (torrent introuvable, erreur AllDebrid…), l'élément passe en erreur dans la file de l'application *arr. La raison est affichée dans les logs du connecteur.
- L'état est sauvegardé dans `<dossier de téléchargement>/.alldebrid-arr/state.json` : après un redémarrage, les téléchargements reprennent là où ils en étaient.
- Seuls les liens HTTPS sont acceptés pour le téléchargement des fichiers.
