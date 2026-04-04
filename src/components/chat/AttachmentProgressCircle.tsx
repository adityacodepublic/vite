type AttachmentProgressCircleProps = {
  progress: number;
};

export function AttachmentProgressCircle({
  progress,
}: AttachmentProgressCircleProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const pct = Math.round(clamped * 100);

  return (
    <div className="absolute right-2 top-2 z-10 rounded-full bg-black/65 p-1 backdrop-blur-xs">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-label={`Uploading ${pct}%`}>
        <circle cx="20" cy="20" r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 20 20)"
        />
        <text
          x="20"
          y="24"
          textAnchor="middle"
          fill="white"
          fontSize="10"
          fontFamily="sans-serif"
        >
          {pct}
        </text>
      </svg>
    </div>
  );
}
