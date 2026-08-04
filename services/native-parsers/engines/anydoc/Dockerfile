FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

WORKDIR /app
ENV NODE_ENV=production

COPY anydoc/package.json anydoc/package-lock.json ./anydoc/
RUN cd anydoc && npm ci --omit=dev --no-audit --no-fund

COPY shared ./shared
COPY anydoc/*.ts ./anydoc/

USER node
EXPOSE 8080
CMD ["node", "anydoc/server.ts"]
