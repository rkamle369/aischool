FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=
ARG VITE_LIVEKIT_URL=
ARG VITE_LIVEKIT_AGENT_MODE=true
ARG VITE_AURA_FEEDBACK_SECONDS=300
ARG VITE_AGENT_TTS_PROVIDER=openai

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
ENV VITE_LIVEKIT_AGENT_MODE=$VITE_LIVEKIT_AGENT_MODE
ENV VITE_AURA_FEEDBACK_SECONDS=$VITE_AURA_FEEDBACK_SECONDS
ENV VITE_AGENT_TTS_PROVIDER=$VITE_AGENT_TTS_PROVIDER

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/40-env-config.sh /docker-entrypoint.d/40-env-config.sh
RUN chmod +x /docker-entrypoint.d/40-env-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
