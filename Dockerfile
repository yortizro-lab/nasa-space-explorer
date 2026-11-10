FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server.js push-service.js docker-entrypoint.sh index.html script.js install.js notifications.js service-worker.js style.css manifest.json ./
COPY imagenes/ ./imagenes/

EXPOSE 3000
CMD ["sh", "/app/docker-entrypoint.sh"]
