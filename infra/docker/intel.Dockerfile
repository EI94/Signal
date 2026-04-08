FROM node:22-bookworm-slim
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/config ./packages/config
COPY packages/contracts ./packages/contracts
COPY services/intel ./services/intel
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=staging
EXPOSE 8080
WORKDIR /app
CMD ["pnpm", "--filter", "@signal/intel", "exec", "tsx", "src/server.ts"]
