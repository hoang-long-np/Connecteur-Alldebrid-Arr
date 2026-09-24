# Étape 1 : vérification des types et création du fichier unique release/connecteur.mjs
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run package

# Étape 2 : image finale, sans aucune dépendance npm
FROM node:24-alpine
ENV NODE_ENV=production \
    TZ=Europe/Paris \
    PORT=8090 \
    DOWNLOAD_DIR=/downloads
WORKDIR /app
COPY --from=build /src/release/connecteur.mjs ./
USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1
CMD ["node", "connecteur.mjs"]
