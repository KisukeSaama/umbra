# Umbra runtime image.
#
# Next builds a standalone server, so the runtime layer carries the traced
# dependencies only, not the whole node_modules tree. The build stays a single
# image: one application, one container.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Development: source is bind mounted, Next watches it. Never deployed.
FROM node:24-alpine AS dev
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1     NODE_ENV=development     PORT=3000     HOSTNAME=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production     NEXT_TELEMETRY_DISABLED=1     PORT=3000     HOSTNAME=0.0.0.0

# Runs unprivileged; the uid is fixed so a bind mount can be chowned to it.
RUN addgroup -g 10001 -S umbra && adduser -S -u 10001 -G umbra umbra

COPY --from=builder --chown=umbra:umbra /app/public ./public
COPY --from=builder --chown=umbra:umbra /app/.next/standalone ./
COPY --from=builder --chown=umbra:umbra /app/.next/static ./.next/static
# Applied at boot by src/instrumentation.ts.
COPY --from=builder --chown=umbra:umbra /app/drizzle ./drizzle
COPY --from=builder --chown=umbra:umbra /app/scripts ./scripts

USER umbra
EXPOSE 3000
CMD ["node", "server.js"]
