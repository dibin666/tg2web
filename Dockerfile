# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS frontend-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts eslint.config.js ./
COPY public ./public
COPY src ./src

ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM rust:1-trixie AS backend-build
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libc++-dev \
        libc++abi-dev \
        libssl-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY backend/Cargo.toml backend/Cargo.toml
COPY backend/migrations backend/migrations
COPY backend/src backend/src

RUN cargo build --release -p tg2web-backend
RUN set -eux; \
    mkdir -p /out/lib; \
    cp target/release/tg2web-backend /out/tg2web-backend; \
    cp target/release/build/tdlib-rs-*/out/tdlib/lib/libtdjson.so* /out/lib/

FROM debian:trixie-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        flac \
        libc++1 \
        libc++abi1 \
        libssl3t64 \
        libunwind8 \
        nginx \
        tini \
        zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY --from=backend-build /out/tg2web-backend /usr/local/bin/tg2web-backend
COPY --from=backend-build /out/lib/ /usr/local/lib/
COPY --from=frontend-build /app/dist/ /usr/share/nginx/html/
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /usr/local/bin/tg2web-entrypoint

RUN chmod +x /usr/local/bin/tg2web-entrypoint && ldconfig

ENV LD_LIBRARY_PATH=/usr/local/lib \
    TG2WEB_BIND_ADDR=127.0.0.1:8787 \
    TG2WEB_DATABASE_PATH=/app/data/tg2web.sqlite3 \
    TG2WEB_MEDIA_CACHE_PATH=/app/data/media-cache \
    TG2WEB_TDLIB_DATABASE_PATH=/app/data/tdlib \
    TG2WEB_CORS_ORIGIN=*

WORKDIR /app
VOLUME ["/app/data"]
EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/tg2web-entrypoint"]
