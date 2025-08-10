FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm i -g pnpm && pnpm i
COPY . .
RUN pnpm build && pnpm prune --prod
ENTRYPOINT ["node","dist/index.js"]