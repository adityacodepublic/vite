import { useEffect, useRef } from "react";
import vegaEmbed from "vega-embed";

type AltairChartProps = {
  specJson: string;
};

export function AltairChart({ specJson }: AltairChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(specJson);
    } catch {
      containerRef.current.innerHTML = "Invalid chart payload.";
      return;
    }

    vegaEmbed(containerRef.current, parsed as never, {
      theme: "powerbi",
      config: {
        axis: { labelFontSize: 12, titleFontSize: 14 },
        legend: { labelFontSize: 11, titleFontSize: 12 },
        background: "#ffffff00",
      },
      width: 620,
      height: 340,
      actions: false,
    });
  }, [specJson]);

  return <div className="vega-embed w-full" ref={containerRef} />;
}
