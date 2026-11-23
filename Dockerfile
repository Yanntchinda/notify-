FROM node:20-alpine

WORKDIR /app

# Dépendances de production uniquement
COPY package*.json ./
RUN npm ci --omit=dev

# Code de l'application
COPY server ./server
COPY public ./public
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# La base de démonstration est créée au premier démarrage (seedIfEmpty)
CMD ["node", "server/index.js"]
