FROM node:22-slim AS base
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
RUN npm install --workspace=apps/backend

COPY apps/backend apps/backend
COPY tsconfig.json tsconfig.json

RUN npm run build -w apps/backend

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/backend/dist/server.js"]
