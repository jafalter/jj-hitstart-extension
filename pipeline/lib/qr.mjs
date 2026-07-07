// QR generation. See PLAN.md §9. Error-correction level Q for print robustness.
import QRCode from "qrcode";

export async function writeQrPng(url, outPath, { scale = 8, margin = 2 } = {}) {
  await QRCode.toFile(outPath, url, {
    errorCorrectionLevel: "Q",
    type: "png",
    margin, // quiet zone (modules)
    scale,
  });
  return outPath;
}
