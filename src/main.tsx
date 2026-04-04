import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import reportWebVitals from "./lib/tests/reportWebVitals.ts";
import "katex/contrib/copy-tex";
import "katex/dist/katex.min.css";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

reportWebVitals();
