FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY services/api/package.json services/api/package.json
RUN npm install
COPY . .
RUN npm run build:web

FROM nginx:1.29-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
