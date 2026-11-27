# Kanvaro MCP server — container image (task 1.7)
#
# Build (from mcp-server/):   docker build -t kanvaro-mcp-server .
# Run: settings as environment variables, secrets as mounted files (_FILE), e.g.
#   docker run --rm -p 3100:3100 \
#     -e NODE_ENV=production -e PUBLIC_BASE_URL=https://mcp.example.com \
#     -e KANVARO_API_BASE_URL=http://kanvaro:3000 -e KANVARO_PUBLIC_URL=https://kanvaro.example.com \
#     -e KANVARO_CLIENT_ID=kanvaro-mcp-server -e TRUST_PROXY=1 \
#     -e KANVARO_CLIENT_SECRET_FILE=/run/secrets/kanvaro_client_secret \
#     -e MONGODB_URI_FILE=/run/secrets/mongodb_uri \
#     -v ./secrets:/run/secrets:ro kanvaro-mcp-server
# HTTPS is terminated by the reverse proxy in front of this container.

# ---- build: install all dependencies, compile, then drop dev dependencies ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime: compiled code and production dependencies only ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3100
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Node runs as PID 1 and receives SIGTERM directly; the server shuts down gracefully.
CMD ["node", "dist/main.js"]
