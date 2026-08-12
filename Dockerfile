FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# npm ci installs Prisma but does not create the generated client. Generate it
# before tests import API modules, then build the frontend without regenerating.
RUN npx prisma generate && npm test && npx tsc --noEmit && npx vite build

EXPOSE 3000

# The app only needs read/execute access to its source, generated client, and
# static build at runtime. Drop root privileges without recursively rewriting
# the dependency tree (which makes Dokploy releases unnecessarily slow).
USER node
ENV NODE_ENV=production

# Dokploy can use this to remove unhealthy instances from service traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok) process.exit(1)}).catch(()=>process.exit(1))"

# Use node --import tsx instead of npx for faster, more reliable startup
CMD ["node", "--import", "tsx", "server.ts"]
