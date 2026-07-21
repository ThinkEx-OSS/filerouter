FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

WORKDIR /app
ENV NODE_ENV=production
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata

RUN DEBIAN_FRONTEND=noninteractive apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates \
      imagemagick \
      libvips42 \
      libreoffice-calc \
      libreoffice-core \
      libreoffice-impress \
      libreoffice-writer \
      tesseract-ocr \
      tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

COPY liteparse/package.json liteparse/package-lock.json ./liteparse/
RUN cd liteparse && npm ci --omit=dev --no-audit --no-fund

COPY shared ./shared
COPY liteparse/server.ts ./liteparse/server.ts

USER node
EXPOSE 8080
CMD ["node", "liteparse/server.ts"]
