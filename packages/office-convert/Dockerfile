FROM node:22.23.4-trixie-slim AS build
RUN corepack enable
COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ ./patches/
COPY packages/protocol/ ./packages/protocol/
COPY packages/wire-types/ ./packages/wire-types/
COPY packages/office-convert/ ./packages/office-convert/
RUN pnpm install --frozen-lockfile --prod --filter @houston/office-convert... \
    && bun build packages/office-convert/src/main.ts --target=bun --outfile=/app/office-convert.js

FROM debian:trixie-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice-impress libreoffice-writer libreoffice-calc poppler-utils locales \
       fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation2 \
       fonts-dejavu-core fonts-noto-cjk \
    && printf 'en_US.UTF-8 UTF-8\nes_ES.UTF-8 UTF-8\npt_BR.UTF-8 UTF-8\n' > /etc/locale.gen \
    && locale-gen \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home converter
COPY --from=build /usr/local/bin/bun /usr/local/bin/bun
COPY --from=build /app/office-convert.js /app/office-convert.js
RUN { sha256sum /app/office-convert.js; dpkg-query -W; } | sha256sum | cut -d ' ' -f 1 > /app/converter-version
ARG CONVERTER_VERSION
ENV CONVERTER_VERSION=$CONVERTER_VERSION
USER converter
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "export CONVERTER_VERSION=\"${CONVERTER_VERSION:-$(cat /app/converter-version)}\"; exec bun /app/office-convert.js"]
