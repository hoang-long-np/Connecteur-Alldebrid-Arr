# Stack complète : connecteur + Radarr + Sonarr + Prowlarr + Bazarr

`compose.yaml` déploie le connecteur AllDebrid avec les applications *arr, sur un même réseau Docker.

| Service | Port | Rôle |
| --- | --- | --- |
| `alldebrid-arr` | 8090 | Client de téléchargement AllDebrid + interface web de suivi |
| `radarr` | 7878 | Films |
| `sonarr` | 8989 | Séries |
| `prowlarr` | 9696 | Indexeurs, synchronisés vers Radarr et Sonarr |
| `bazarr` | 6767 | Sous-titres |

## Organisation des fichiers

Deux dossiers de l'hôte sont montés, au même chemin dans tous les conteneurs qui en ont besoin :

| Variable | Monté sur | Utilisé par | Contenu |
| --- | --- | --- | --- |
| `DOWNLOADS_PATH` | `/downloads` | connecteur, Radarr, Sonarr | un sous-dossier par catégorie : `radarr/`, `tv-sonarr/` |
| `MEDIA_PATH` | `/media` | Radarr, Sonarr, Bazarr | `movies/` (Radarr), `tv/` (Sonarr) |

Les chemins sont les mêmes dans tous les conteneurs : aucun *Remote Path Mapping* n'est nécessaire.

Téléchargements et bibliothèques étant deux montages distincts, Radarr/Sonarr importent par copie puis suppression : l'import prend le temps de copier le fichier et demande temporairement le double d'espace.

Les configurations des applications sont stockées dans des volumes Docker nommés (`radarr-config`, `sonarr-config`…).

## Mise en route

1. **Libérer les noms et les ports.** Arrêter la stack du connecteur seul (même nom de conteneur `alldebrid-arr`) et toute autre instance de Radarr, Sonarr, Prowlarr ou Bazarr qui utiliserait les mêmes ports.
2. **Créer les dossiers** sur l'hôte, par exemple :
   ```bash
   sudo mkdir -p /mnt/tank/downloads /mnt/tank/media/movies /mnt/tank/media/tv
   ```
   L'utilisateur `ARR_UID` (568 par défaut) doit pouvoir y écrire. Sur TrueNAS : *Datasets → Permissions → Edit*, droit *Modify* pour l'utilisateur `apps`, appliqué récursivement.
3. **Déployer** `compose.yaml` en renseignant les variables de `stack.env.example` (au minimum `ALLDEBRID_API_KEY`, `DOWNLOADS_PATH` et `MEDIA_PATH`).
4. **Configurer les applications** (dans les interfaces web, sur l'adresse de l'hôte) :

   **Radarr** (`:7878`)
   - *Settings → Media Management → Root Folders* : `/media/movies`
   - *Settings → Download Clients → + → qBittorrent* : Host `alldebrid-arr`, Port `8090`, Category `radarr`, identifiants `QBIT_USERNAME`/`QBIT_PASSWORD`

   **Sonarr** (`:8989`)
   - *Settings → Media Management → Root Folders* : `/media/tv`
   - *Settings → Download Clients → + → qBittorrent* : Host `alldebrid-arr`, Port `8090`, Category `tv-sonarr`

   **Prowlarr** (`:9696`)
   - *Indexers* : ajouter les indexeurs torrent
   - *Settings → Apps* : ajouter Radarr (Prowlarr Server `http://prowlarr:9696`, Radarr Server `http://radarr:7878`, clé API de Radarr dans *Settings → General*) puis Sonarr (`http://sonarr:8989`)

   **Bazarr** (`:6767`)
   - *Settings → Radarr* : Address `radarr`, Port `7878`, clé API de Radarr
   - *Settings → Sonarr* : Address `sonarr`, Port `8989`, clé API de Sonarr
   - *Settings → Languages* et *Providers* : langues et fournisseurs de sous-titres

Les conteneurs se joignent par leur nom de service ; l'adresse IP de l'hôte ne sert que depuis le navigateur.

## Reprendre une installation existante

Radarr et Sonarr savent exporter leur configuration (*System → Backup*) et la restaurer dans la nouvelle instance. Après restauration, mettre à jour les dossiers racine (`/media/movies`, `/media/tv`) et le client de téléchargement (`alldebrid-arr`, port `8090`), qui pointent encore vers les anciens chemins.
