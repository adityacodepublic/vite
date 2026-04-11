export type SnapshotSource = "screen" | "camera";

export type SnapshotResult = {
  source: SnapshotSource;
  mimeType: string;
  width: number;
  height: number;
  timestamp: string;
  startedStreamForCapture: boolean;
};

type SnapshotHandler = (args: {
  source: SnapshotSource;
}) => Promise<SnapshotResult>;

let snapshotHandler: SnapshotHandler | null = null;

export function registerSnapshotHandler(handler: SnapshotHandler) {
  snapshotHandler = handler;
}

export function clearSnapshotHandler() {
  snapshotHandler = null;
}

export async function invokeSnapshotHandler(args: {
  source: SnapshotSource;
}): Promise<SnapshotResult> {
  if (!snapshotHandler) {
    throw new Error("Snapshot capture is not available right now.");
  }

  return snapshotHandler(args);
}
