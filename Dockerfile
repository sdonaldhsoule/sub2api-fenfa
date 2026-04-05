FROM node:20-alpine AS dev

WORKDIR /workspace

COPY package.json ./package.json
COPY scripts ./scripts
COPY welfare-backend/package*.json ./welfare-backend/
COPY welfare-frontend/package*.json ./welfare-frontend/

RUN cd welfare-backend && npm ci
RUN cd welfare-frontend && npm ci

COPY welfare-backend ./welfare-backend
COPY welfare-frontend ./welfare-frontend

EXPOSE 5173 8787

CMD ["npm", "run", "dev"]

FROM node:20-alpine AS frontend-builder

WORKDIR /build/welfare-frontend

COPY welfare-frontend/package*.json ./
RUN npm ci

COPY welfare-frontend ./
RUN npm run build

FROM node:20-alpine AS backend-builder

WORKDIR /build/welfare-backend

COPY welfare-backend/package*.json ./
RUN npm ci

COPY welfare-backend ./
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY welfare-backend/package*.json ./welfare-backend/
RUN cd welfare-backend && npm ci --omit=dev

COPY --from=backend-builder /build/welfare-backend/dist ./welfare-backend/dist
COPY --from=backend-builder /build/welfare-backend/migrations ./welfare-backend/migrations
COPY --from=frontend-builder /build/welfare-frontend/dist ./welfare-backend/dist/public

WORKDIR /app/welfare-backend

EXPOSE 8080

CMD ["node", "dist/server.js"]
