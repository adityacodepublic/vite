import { useEffect, useRef } from "react";
import vegaEmbed from "vega-embed";

type AltairChartProps = {
  specJson: string;
};

function normalizeChartSpec(input: unknown): unknown {
  let spec = input;

  if (spec && typeof spec === "object" && !Array.isArray(spec)) {
    const container = spec as Record<string, unknown>;
    const nested = container.json_graph ?? container.output ?? container.spec;
    if (typeof nested === "string") {
      try {
        spec = JSON.parse(nested);
      } catch {
        spec = nested;
      }
    } else if (nested && typeof nested === "object") {
      spec = nested;
    }
  }

  if (spec && typeof spec === "object" && !Array.isArray(spec)) {
    const chart = spec as Record<string, unknown>;
    const schema = chart.$schema;
    if (typeof schema === "string" && schema.includes("altair-viz.github.io")) {
      chart.$schema = "https://vega.github.io/schema/vega-lite/v5.json";
    }
    return chart;
  }

  return spec;
}

export function AltairChart({ specJson }: AltairChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = normalizeChartSpec(JSON.parse(specJson));
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
    }).catch((error) => {
      containerRef.current!.innerHTML = "Could not render chart payload.";
      console.error("[AltairChart] Failed to render chart", error, parsed);
    });
  }, [specJson]);

  return <div className="vega-embed w-full" ref={containerRef} />;
}
