FROM node:22-slim AS build
WORKDIR /repo

   ENV VITE_GATEWAY_URL=https://gatekeeper-gateway.onrender.com

COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
RUN npm install --workspace=apps/dashboard

COPY apps/dashboard apps/dashboard
RUN npm run build -w apps/dashboard

FROM node:22-slim AS serve
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /repo/apps/dashboard/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
