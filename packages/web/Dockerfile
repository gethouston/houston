# Serves the pre-built Houston Cloud web SPA over HTTP (port 8080, non-root nginx).
# The SPA's config is baked at BUILD time, so build dist first:
#   VITE_CONTROL_PLANE_URL=http://<cp-ip> \
#   VITE_CP_SUPABASE_URL=https://<ref>.supabase.co \
#   VITE_CP_SUPABASE_ANON_KEY=<anon-key> \
#   SENTRY_DSN=<houston-app DSN> \
#     pnpm --filter houston-web build
# (SENTRY_DSN powers browser crash reporting; "Send feedback" needs the
#  control plane's CP_LINEAR_API_KEY/CP_LINEAR_TEAM_ID — see cloud/k8s.)
# then, from packages/web:
#   gcloud builds submit --tag us-east1-docker.pkg.dev/gethouston/houston/web:v1 .
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
EXPOSE 8080
