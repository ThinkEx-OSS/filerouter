FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

WORKDIR /app
ENV NODE_ENV=production

COPY pdf-inspector/package.json pdf-inspector/package-lock.json ./pdf-inspector/
RUN cd pdf-inspector && npm ci --omit=dev --no-audit --no-fund

COPY shared ./shared
COPY pdf-inspector/server.ts ./pdf-inspector/server.ts

USER node
EXPOSE 8080
CMD ["node", "pdf-inspector/server.ts"]
