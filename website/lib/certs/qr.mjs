import QRCode from "qrcode";

/**
 * Render the certificate's verification URL as a PNG data URL.
 *
 * satori cannot rasterise an <svg> child, so the QR ships as a data-URL <img>.
 * 480px keeps the module edges crisp when the image is drawn at 200px in a
 * 2000px-wide canvas and again when the certificate is printed.
 */
export async function qrDataUrl(pageUrl) {
  return QRCode.toDataURL(pageUrl, {
    margin: 0,
    width: 480,
    errorCorrectionLevel: "M",
    color: { dark: "#0d0d0d", light: "#ffffff" },
  });
}
