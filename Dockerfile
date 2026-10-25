# Image du serveur de jeu (fichiers statiques + WebSocket + administration).
#
# Isolation : l'image finale est « distroless » — ni shell, ni gestionnaire de paquets,
# ni outils système — et le processus tourne sous un utilisateur sans privilège (uid 65532).
# Une faille dans le serveur ne donne donc accès qu'à Node et aux fichiers du jeu, en lecture.

# --- Étape 1 : compilation de la page d'administration (Svelte + Vite) --------------------
FROM node:22-alpine AS admin
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY admin/ ./admin/
RUN npm run build:admin

# --- Étape 2 : dépendances de production -------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force && mkdir -p /data

# --- Étape 3 : image finale minimale (ni Svelte ni Vite : seulement la page compilée) ------
FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 SHOW_LAN=0 DATA_DIR=/data
# Fichiers appartenant à root : l'utilisateur du serveur peut les lire, pas les modifier
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server/ ./server/
COPY index.html README.md ./
COPY js/ ./js/
COPY css/ ./css/
COPY sounds/ ./sounds/
COPY --from=admin /app/admin/dist ./admin/dist/
# Seul dossier modifiable : les compteurs de l'administration (volume chess-data)
COPY --from=deps --chown=65532:65532 /data /data
USER nonroot
EXPOSE 8080
CMD ["server/server.js"]
