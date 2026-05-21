# syntax=docker/dockerfile:1.7

# Build stage: install deps, compile library + examples site.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json biome.json ./
COPY src ./src
COPY examples ./examples

RUN npm run build && npm run build:examples

# Serve stage: nginx serves the static examples bundle.
FROM nginx:alpine AS serve

COPY --from=build /app/examples/dist /usr/share/nginx/html
COPY --from=build /app/examples/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1
