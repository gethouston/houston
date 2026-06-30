# Static web frontend image for the kind POC.
# Build context: monorepo root (packages/web/dist must already exist).
# Build the web first:
#   VITE_CONTROL_PLANE_URL=http://localhost:8080 VITE_CP_DEV_TOKEN=poc-dev-token \
#     pnpm --filter houston-web build
FROM nginx:1.27-alpine
COPY cloud/k8s/poc/nginx-frontend.conf /etc/nginx/conf.d/default.conf
COPY packages/web/dist /usr/share/nginx/html
EXPOSE 80
