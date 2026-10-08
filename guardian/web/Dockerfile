# Guardian parent dashboard (Next.js standalone output).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_PUBLIC_URL
ARG NEXT_PUBLIC_POLICY_VERSION=2026-10
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_PUBLIC_URL=$NEXT_PUBLIC_API_PUBLIC_URL NEXT_PUBLIC_POLICY_VERSION=$NEXT_PUBLIC_POLICY_VERSION
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/content ./content
USER node
EXPOSE 3001
CMD ["node", "server.js"]
