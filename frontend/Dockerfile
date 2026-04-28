FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=http://localhost:4000
ARG VITE_LIVEKIT_URL=ws://localhost:7880
ARG VITE_LIVEKIT_SELF_HOSTED=true

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_LIVEKIT_URL=${VITE_LIVEKIT_URL}
ENV VITE_LIVEKIT_SELF_HOSTED=${VITE_LIVEKIT_SELF_HOSTED}

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
