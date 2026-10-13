# Umbra runtime image.
#
# Next builds a standalone server, so the runtime layer carries the traced
# dependencies only, not the whole node_modules tree. The build stays a single
# image: one application, one container.

# Pinned by digest as well as tag: a tag moves, and the image that passed the
# pipeline is the one that should be rebuilt. Bump both together.
ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Development: source is bind mounted, Next watches it. Never deployed.
FROM ${NODE_IMAGE} AS dev
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1     NODE_ENV=development     PORT=3000     HOSTNAME=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build fails, and no image is pushed, if Drizzle reached the browser bundle.
RUN npm run build && npm run check:bundle

FROM ${NODE_IMAGE} AS runner
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
