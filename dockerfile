############################################
# Stage 1: Build the Vue.js frontend
############################################
FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

COPY .npmrc package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

############################################
# Stage 2: Production dependencies only
############################################
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

COPY .npmrc package.json package-lock.json ./
RUN npm ci --omit=dev && \
    npm ls @playwright/test >/dev/null 2>&1 || npm install --no-save @playwright/test@1.39.0

############################################
# Stage 3: Final image
############################################
FROM node:22-bookworm-slim AS release
WORKDIR /app

RUN apt-get update && \
    apt-get --yes --no-install-recommends install \
        sqlite3 \
        ca-certificates \
        iputils-ping \
        dumb-init \
        curl \
        chromium \
        fonts-indic \
        fonts-noto \
        fonts-noto-cjk && \
    rm -rf /var/lib/apt/lists/*

ENV UPTIME_KUMA_IS_CONTAINER=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Production node_modules (no devDependencies)
COPY --from=prod-deps /app/node_modules /app/node_modules

# Built frontend
COPY --from=build /app/dist /app/dist

# Application source and config files
COPY --from=build /app/server /app/server
COPY --from=build /app/src /app/src
COPY --from=build /app/extra /app/extra
COPY --from=build /app/config /app/config
COPY --from=build /app/db /app/db
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/.npmrc /app/.npmrc

RUN mkdir -p ./data

EXPOSE 3001
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
USER node
CMD ["node", "server/server.js"]
