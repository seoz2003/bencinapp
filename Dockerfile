# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/bencinapp.db \
    FRONTEND_DIST=/app/frontend/dist \
    SEED_SNAPSHOT_PATH=/app/backend/data/seed/snapshot.csv
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev -w backend && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist frontend/dist
COPY backend/data/seed backend/data/seed
VOLUME ["/data"]
EXPOSE 3000
WORKDIR /app/backend
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
