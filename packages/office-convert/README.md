# @houston/office-convert

Stateless Office-to-PDF conversion with headless LibreOffice. Each request uses a fresh process, temporary directory, and profile. A 30-second timeout kills the process group. Temporary files are removed when the request ends.

## API

- `GET /health` returns `{ "status": "ok", "version": "<image revision>" }`.
- `POST /convert?ext=<extension>&lang=<BCP47>` accepts raw source bytes and returns `application/pdf`, `X-Page-Count`, and `X-Converter-Version`.
- Supported extensions are pptx, docx, xlsx, ppt, doc, xls, odp, odt, and ods.
- Input above 50 MiB returns 413 `too_large`. Unsupported extensions return 415 `unsupported_type`. A timeout returns 504 `timeout`. An unsuccessful conversion returns 422 `conversion_failed`.
- Spanish maps to `es_ES.UTF-8`, Portuguese to `pt_BR.UTF-8`, and other languages to `en_US.UTF-8`.
- Impress includes hidden slides. Calc exports each sheet as one page.

## Run and verify

Build from the repository root. Published images set `CONVERTER_VERSION` to the git revision. Other builds fingerprint the bundled service and installed packages for the cache key.

```sh
docker build -f packages/office-convert/Dockerfile --build-arg CONVERTER_VERSION=local -t houston-office-convert:local .
docker run --rm -p 127.0.0.1:8080:8080 houston-office-convert:local
pnpm --filter @houston/office-convert test
OFFICE_CONVERT_TEST_URL=http://127.0.0.1:8080 pnpm --filter @houston/office-convert test:docker
```

For an internal-only Compose converter, set `OFFICE_CONVERT_TEST_CONTAINER` to its container name instead of `OFFICE_CONVERT_TEST_URL`. The test sends HTTP requests through `docker exec`.

The Docker test converts `fixtures/sheets.xlsx`, a generated one-sheet workbook from the LibreOffice spike. Unit tests exercise HTTP responses, process failures, locale selection, and export options.

## Deployment

`.github/workflows/office-convert-image.yml` publishes `us-east1-docker.pkg.dev/gethouston/houston/office-convert`. Main builds dispatch `office-convert-published`. Tags matching `office-convert-v*` dispatch `office-convert-published-prod`. The payload contains `image`, `digest`, and `sha`. Cloud owns deployment and invokes the service with an ID token. Use concurrency 1, IAM invocation, scale to zero, and deny-all egress. The service runs as a non-root user and holds no secrets.

Self-host sets `HOUSTON_OFFICE_CONVERT_URL` to the sidecar URL. Without that URL the host advertises `officePreview: false`.
