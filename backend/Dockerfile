# =====================================================
# HabitFlow Backend - Dockerfile
# Node.js 20 Alpine (imagine mică și sigură)
# =====================================================

FROM node:20-alpine

# Metadata
LABEL maintainer="HabitFlow"
LABEL description="HabitFlow API Backend"

# Setăm directorul de lucru
WORKDIR /app

# Instalăm dependențele de sistem necesare (pentru bcrypt)
RUN apk add --no-cache python3 make g++

# Copiem package.json înainte de cod (optimizare cache Docker)
COPY package*.json ./

# Instalăm dependențele Node.js (producție)
RUN npm install --omit=dev

# Copiem codul sursă
COPY . .

# Utilizator non-root pentru securitate
RUN addgroup -S habitflow && adduser -S habitflow -G habitflow
USER habitflow

# Portul pe care ascultă API-ul
EXPOSE 3000

# Comanda de pornire
CMD ["node", "server.js"]
