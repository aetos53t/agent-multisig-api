# Forced rebuild: Use NIXPACKS
FROM oven/bun:1

WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
