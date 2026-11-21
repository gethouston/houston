import { loadCertificates } from "../../lib/certs/fetch.mjs";

export default async function () {
  return loadCertificates();
}
