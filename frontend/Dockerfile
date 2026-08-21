FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_USER_SERVICE_URL
ARG NEXT_PUBLIC_FEED_SERVICE_URL
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}
ENV NEXT_PUBLIC_USER_SERVICE_URL=${NEXT_PUBLIC_USER_SERVICE_URL}
ENV NEXT_PUBLIC_FEED_SERVICE_URL=${NEXT_PUBLIC_FEED_SERVICE_URL}

RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next standalone 서버가 컨테이너 안에서 localhost에만 바인딩되면, 로컬 Docker에선
# 포트 포워딩이 되어 안 드러나지만 Render 같은 프록시 기반 컨테이너 네트워킹에선
# 502가 난다(호스트가 컨테이너에 못 붙음) — 모든 인터페이스에 바인딩하도록 명시.
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
