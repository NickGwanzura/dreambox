FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

# Use node --import tsx instead of npx for faster, more reliable startup
CMD ["node", "--import", "tsx", "server.ts"]
