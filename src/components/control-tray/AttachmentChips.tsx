import { X } from "lucide-react";
import { formatBytesAsMb } from "@/lib/live/attachment-manager";

export type TrayAttachmentStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "failed";

export type TrayAttachment = {
  id: string;
  file: File;
  status: TrayAttachmentStatus;
  error?: string;
};

type AttachmentChipsProps = {
  attachments: TrayAttachment[];
  onRemove: (id: string) => void;
  disabled?: boolean;
};

export function AttachmentChips({
  attachments,
  onRemove,
  disabled = false,
}: AttachmentChipsProps) {
  if (!attachments.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 px-1 pt-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {attachments.map((attachment) => (
          <span
            key={attachment.id}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700"
          >
            <span className="truncate max-w-[190px]">{attachment.file.name}</span>
            <span className="text-zinc-500">({formatBytesAsMb(attachment.file.size)})</span>
            <button
              type="button"
              aria-label={`Remove ${attachment.file.name}`}
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white/65 p-1 text-zinc-600 shadow-[0_0_0_1px_rgba(255,255,255,0.35)_inset] backdrop-blur-sm transition hover:bg-white/85 hover:text-zinc-800 disabled:opacity-50"
              onClick={() => onRemove(attachment.id)}
              disabled={disabled}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      {attachments.some((attachment) => attachment.error) ? (
        <div className="space-y-1">
          {attachments
            .filter((attachment) => attachment.error)
            .map((attachment) => (
              <p key={`${attachment.id}-error`} className="text-[11px] text-red-500">
                {attachment.file.name}: {attachment.error}
              </p>
            ))}
        </div>
      ) : null}
    </div>
  );
}
