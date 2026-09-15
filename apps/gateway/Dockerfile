FROM node:22-slim AS base
WORKDIR /repo

# Copy workspace manifests first so `npm install` is cached unless deps change.
COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --workspace=apps/gateway --workspace=packages/shared

COPY apps/gateway apps/gateway
COPY packages/shared packages/shared
COPY tsconfig.json tsconfig.json

RUN npm run build -w apps/gateway

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/gateway/dist/server.js"]
