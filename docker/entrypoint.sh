#!/bin/sh
set -eu

: "${TG2WEB_BIND_ADDR:=127.0.0.1:8787}"
: "${TG2WEB_DATABASE_PATH:=/app/data/tg2web.sqlite3}"
: "${TG2WEB_MEDIA_CACHE_PATH:=/app/data/media-cache}"
: "${TG2WEB_TDLIB_DATABASE_PATH:=/app/data/tdlib}"

export TG2WEB_BIND_ADDR
export TG2WEB_DATABASE_PATH
export TG2WEB_MEDIA_CACHE_PATH
export TG2WEB_TDLIB_DATABASE_PATH

mkdir -p "$(dirname "$TG2WEB_DATABASE_PATH")" "$TG2WEB_MEDIA_CACHE_PATH" "$TG2WEB_TDLIB_DATABASE_PATH"

tg2web-backend &
backend_pid=$!

nginx -g "daemon off;" &
nginx_pid=$!

terminate() {
    trap - INT TERM
    kill -TERM "$nginx_pid" "$backend_pid" 2>/dev/null || true
    wait "$nginx_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
    exit 0
}

trap terminate INT TERM

while :; do
    if ! kill -0 "$backend_pid" 2>/dev/null; then
        status=0
        wait "$backend_pid" || status=$?
        kill -TERM "$nginx_pid" 2>/dev/null || true
        wait "$nginx_pid" 2>/dev/null || true
        exit "$status"
    fi

    if ! kill -0 "$nginx_pid" 2>/dev/null; then
        status=0
        wait "$nginx_pid" || status=$?
        kill -TERM "$backend_pid" 2>/dev/null || true
        wait "$backend_pid" 2>/dev/null || true
        exit "$status"
    fi

    sleep 1
done
