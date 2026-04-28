FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .


ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_LIVEKIT_URL=${VITE_LIVEKIT_URL}
ENV VITE_LIVEKIT_SELF_HOSTED=${VITE_LIVEKIT_SELF_HOSTED}

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/40-env-config.sh /docker-entrypoint.d/40-env-config.sh
RUN chmod +x /docker-entrypoint.d/40-env-config.sh

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
