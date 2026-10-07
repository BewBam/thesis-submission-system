export const THESIS_MAX_FILE_SIZE_MB = 30;

export const THESIS_MAX_FILE_SIZE_BYTES = THESIS_MAX_FILE_SIZE_MB * 1024 * 1024;

/** Multer ceiling. The admin setting thesis_max_file_size_mb is enforced after upload. */
export const THESIS_UPLOAD_CEILING_BYTES = 1024 * 1024 * 1024;

export function isThesisPdfUpload(file: { originalname?: string; mimetype?: string } | undefined): boolean {
  if (!file) {
    return false;
  }
  const name = String(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  const mimeOk = !mime || mime === "application/pdf" || mime === "application/x-pdf";
  return name.endsWith(".pdf") && mimeOk;
}
