import QRCode from "qrcode";

export async function qrDataUrl(pageUrl) {
  return QRCode.toDataURL(pageUrl, {
    margin: 0,
    width: 480,
    errorCorrectionLevel: "M",
    color: { dark: "#0d0d0d", light: "#ffffff" },
  });
}
