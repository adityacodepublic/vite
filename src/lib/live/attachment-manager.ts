export type AttachmentValidationIssueCode = "unsupported_type";

export type AttachmentValidationIssue = {
  file: File;
  code: AttachmentValidationIssueCode;
  message: string;
};

export type AttachmentValidationResult = {
  accepted: File[];
  rejected: AttachmentValidationIssue[];
  totalBytes: number;
};

const inferMimeTypeFromName = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".aac")) return "audio/aac";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  return "";
};

export const resolveMimeType = (file: File): string =>
  file.type || inferMimeTypeFromName(file.name);

export const isSupportedMediaType = (mimeType: string): boolean =>
  mimeType.startsWith("image/") ||
  mimeType.startsWith("audio/") ||
  mimeType.startsWith("video/");

export const formatBytesAsMb = (bytes: number): string =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function validateAttachmentSelection(
  incomingFiles: File[],
  existingFiles: File[] = [],
): AttachmentValidationResult {
  const accepted: File[] = [];
  const rejected: AttachmentValidationIssue[] = [];
  const existingBytes = existingFiles.reduce((sum, file) => sum + file.size, 0);

  for (const file of incomingFiles) {
    const mimeType = resolveMimeType(file);

    if (!isSupportedMediaType(mimeType)) {
      rejected.push({
        file,
        code: "unsupported_type",
        message: `${file.name}: Coming soon for this file type.`,
      });
      continue;
    }

    accepted.push(file);
  }

  return {
    accepted,
    rejected,
    totalBytes:
      existingBytes + accepted.reduce((sum, file) => sum + file.size, 0),
  };
}
