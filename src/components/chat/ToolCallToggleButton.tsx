import { List, ListX } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type ToolCallToggleButtonProps = {
  pressed: boolean;
  label: string;
  onClick: () => void;
};

export function ToolCallToggleButton({
  pressed,
  label,
  onClick,
}: ToolCallToggleButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className="inline-flex size-11 items-center justify-center rounded-full border border-white/70 bg-white/85 text-zinc-600 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
        >
          {pressed ? <List className="size-5" /> : <ListX className="size-5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
