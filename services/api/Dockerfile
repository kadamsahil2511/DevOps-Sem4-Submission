FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY services/api/package.json services/api/package.json
COPY prisma.config.ts prisma.config.ts
COPY services/api/prisma services/api/prisma
RUN npm install
COPY services/api services/api
RUN npm run build:api

FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S tradenet && adduser -S tradenet -G tradenet
COPY package*.json ./
COPY services/api/package.json services/api/package.json
COPY prisma.config.ts prisma.config.ts
COPY services/api/prisma services/api/prisma
RUN npm install --omit=dev --workspace @tradenet/api && npm run db:generate
COPY --from=build /app/services/api/dist services/api/dist
USER tradenet
EXPOSE 8080
CMD ["npm", "start", "--workspace", "@tradenet/api"]
