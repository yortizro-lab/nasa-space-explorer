FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY server.js index.html script.js style.css ./
COPY imagenes/ ./imagenes/

USER node
EXPOSE 3000
CMD ["node", "server.js"]
