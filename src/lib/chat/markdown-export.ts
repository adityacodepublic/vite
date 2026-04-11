import { remarkDocx } from "@m2d/remark-docx";
import { unified } from "unified";
import katexCss from "katex/dist/katex.min.css?inline";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";

type ExportWordOptions = {
  title: string;
  markdown: string;
};

type ExportPdfOptions = {
  title: string;
  contentElement: HTMLElement;
};

const sanitizeFileName = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "markdown-card";
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const toPrintDocument = (title: string, contentHtml: string) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: only light;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #111827;
        font-family: Arial, sans-serif;
      }

      .pdf-export-root {
        max-width: 840px;
        margin: 0 auto;
        padding: 28px 34px;
        font-size: 14px;
        line-height: 1.65;
      }

      .pdf-export-root h1,
      .pdf-export-root h2,
      .pdf-export-root h3,
      .pdf-export-root h4,
      .pdf-export-root h5,
      .pdf-export-root h6 {
        font-family: Arial, sans-serif;
        margin: 1.2em 0 0.4em;
        line-height: 1.3;
      }

      .pdf-export-root p,
      .pdf-export-root ul,
      .pdf-export-root ol,
      .pdf-export-root blockquote,
      .pdf-export-root pre,
      .pdf-export-root table {
        margin: 0 0 0.9em;
      }

      .pdf-export-root pre {
        border: 1px solid #d4d4d8;
        border-radius: 6px;
        padding: 10px;
        white-space: pre-wrap;
      }

      .pdf-export-root code {
        font-family: "Courier New", Courier, monospace;
        font-size: 0.92em;
      }

      .pdf-export-root table {
        border-collapse: collapse;
        width: 100%;
      }

      .pdf-export-root th,
      .pdf-export-root td {
        border: 1px solid #d4d4d8;
        padding: 6px 8px;
      }

      .pdf-export-root * {
        color: #111827;
      }

      ${katexCss}

      @page {
        size: A4;
        margin: 16mm;
      }
    </style>
  </head>
  <body>
    <article class="pdf-export-root">${contentHtml}</article>
  </body>
</html>
`;

export const downloadMarkdownAsWord = async ({
  title,
  markdown,
}: ExportWordOptions) => {
  const docxProps = {
    styles: {
      default: {
        document: {
          paragraph: {
            spacing: {
              line: 340,
            },
          },
          run: {
            font: "Arial",
            size: 24,
          },
        },
        heading1: {
          run: {
            font: "Arial",
          },
        },
        heading2: {
          run: {
            font: "Arial",
          },
        },
        heading3: {
          run: {
            font: "Arial",
          },
        },
      },
    },
  };

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkBreaks)
    .use(remarkDocx, "blob", docxProps);

  const vfile = await processor.process(markdown || " ");
  const blob = (await vfile.result) as Blob;
  downloadBlob(blob, `${sanitizeFileName(title)}.docx`);
};

export const downloadMarkdownAsPdf = async ({
  title,
  contentElement,
}: ExportPdfOptions) => {
  const documentHtml = toPrintDocument(title, contentElement.innerHTML);
  const printFrame = document.createElement("iframe");
  printFrame.setAttribute("aria-hidden", "true");
  printFrame.style.position = "fixed";
  printFrame.style.right = "0";
  printFrame.style.bottom = "0";
  printFrame.style.width = "0";
  printFrame.style.height = "0";
  printFrame.style.border = "0";

  const cleanup = () => {
    if (printFrame.parentNode) {
      printFrame.parentNode.removeChild(printFrame);
    }
  };

  await new Promise<void>((resolve, reject) => {
    printFrame.onload = () => resolve();
    printFrame.onerror = () => reject(new Error("Unable to load print frame"));
    document.body.appendChild(printFrame);
    printFrame.srcdoc = documentHtml;
  });

  const printWindow = printFrame.contentWindow;
  if (!printWindow) {
    cleanup();
    throw new Error("Unable to access print window");
  }

  await new Promise((resolve) => setTimeout(resolve, 120));

  const handleAfterPrint = () => {
    printWindow.removeEventListener("afterprint", handleAfterPrint);
    cleanup();
  };

  printWindow.addEventListener("afterprint", handleAfterPrint);
  printWindow.focus();
  printWindow.print();

  window.setTimeout(() => {
    cleanup();
  }, 60000);
};
