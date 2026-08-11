FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm test && npx tsc --noEmit && npm run build

EXPOSE 3000

# Dokploy can use this to remove unhealthy instances from service traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok) process.exit(1)}).catch(()=>process.exit(1))"

# Use node --import tsx instead of npx for faster, more reliable startup
CMD ["node", "--import", "tsx", "server.ts"]
