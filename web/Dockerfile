FROM node:24.7.0-alpine AS build
WORKDIR /src
RUN npm install -g pnpm@11.25.0
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ .
RUN pnpm build
FROM nginx:1.28.0-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
