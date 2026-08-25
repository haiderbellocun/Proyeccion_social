FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts postcss.config.mjs ./
COPY src ./src
ARG VITE_API_URL=""
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
RUN npm run build

FROM node:22-alpine AS backend-dependencies
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=backend-dependencies /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY --from=frontend-build /app/dist ./backend/public
RUN chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "backend/src/index.js"]
