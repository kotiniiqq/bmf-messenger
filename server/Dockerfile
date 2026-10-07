# Build and run the API. Multi-stage so the runtime image carries no toolchain.
FROM node:22-bookworm-slim AS build

WORKDIR /app

# argon2 is a native module; it needs a compiler at install time.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY desktop/package.json desktop/

# All workspaces, because filtering them stops npm from linking @bmf/shared into
# node_modules and the server then cannot resolve it. The desktop workspace comes
# along for the ride, so Electron's 200 MB binary is skipped — nothing in this
# image runs it.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci

COPY tsconfig.base.json tsconfig.json ./
COPY shared shared
COPY server server

# Belt and braces alongside .dockerignore: a stale tsbuildinfo convinces tsc -b
# that everything is current, so it emits nothing and the image ships no dist.
RUN find . -name '*.tsbuildinfo' -delete     && npm run build -w shared && npm run build -w server

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/shared/package.json shared/package.json
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist

# Never run as root: a container escape should not land on a privileged shell.
USER node

EXPOSE 3000
WORKDIR /app/server
CMD ["node", "dist/main.js"]
