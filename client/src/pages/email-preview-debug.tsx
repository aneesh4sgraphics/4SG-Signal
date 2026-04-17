import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface PreviewResult {
  raw: string;
  sanitized: string;
  final: string;
  stats: {
    rawLength: number;
    sanitizedLength: number;
    finalLength: number;
    rawVsSanitizedDiff: number;
  };
}

function HtmlFrame({ html, title }: { html: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>{title}</div>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        sandbox="allow-same-origin allow-scripts allow-popups"
        style={{
          width: "100%",
          minHeight: 400,
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          background: "#fff",
        }}
        title={title}
      />
    </div>
  );
}

function CodeBlock({ html, label }: { html: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = html.slice(0, 600);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: "#6b7280" }}>{label}</span>
        <Badge variant="outline" style={{ fontSize: 11 }}>{html.length} chars</Badge>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ fontSize: 11, color: "#6366f1", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {expanded ? "collapse" : "show full source"}
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(html)}
          style={{ fontSize: 11, color: "#10b981", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          copy
        </button>
      </div>
      <pre style={{
        background: "#1e1e1e",
        color: "#d4d4d4",
        padding: "10px 14px",
        borderRadius: 6,
        fontSize: 11,
        overflowX: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        maxHeight: expanded ? "none" : 180,
        overflow: expanded ? "auto" : "hidden",
      }}>
        {expanded ? html : preview + (html.length > 600 ? "\n\n… (truncated — click 'show full source')" : "")}
      </pre>
    </div>
  );
}

export default function EmailPreviewDebug() {
  const [inputHtml, setInputHtml] = useState("");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "source">("preview");

  const mutation = useMutation({
    mutationFn: async (html: string) => {
      const res = await apiRequest("POST", "/api/email/preview-process", { html });
      return res as PreviewResult;
    },
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const handleProcess = () => {
    if (!inputHtml.trim()) return;
    mutation.mutate(inputHtml);
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Email HTML Preview &amp; Debug</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          Paste your HTML email below to see exactly how it will be processed — raw input, after DOMPurify sanitization, and with tracking injection applied.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        <Textarea
          value={inputHtml}
          onChange={e => setInputHtml(e.target.value)}
          placeholder={`Paste your full HTML email here...\n\n<!DOCTYPE html>\n<html>\n<head><style>/* styles */</style></head>\n<body>\n  <table width="600" bgcolor="#ffffff">\n    <tr><td style="padding:20px; color:#333;">Hello!</td></tr>\n  </table>\n</body>\n</html>`}
          style={{ fontFamily: "monospace", fontSize: 12, minHeight: 200, resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button onClick={handleProcess} disabled={mutation.isPending || !inputHtml.trim()}>
            {mutation.isPending ? "Processing…" : "Process & Preview"}
          </Button>
          {inputHtml && (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>{inputHtml.length} chars pasted</span>
          )}
        </div>
        {mutation.isError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#dc2626" }}>
            Error: {(mutation.error as Error)?.message || "Unknown error"}
          </div>
        )}
      </div>

      {result && (
        <>
          {/* Stats bar */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "6px 12px", fontSize: 12 }}>
              <span style={{ color: "#15803d", fontWeight: 600 }}>Raw:</span>{" "}
              <span style={{ color: "#166534" }}>{result.stats.rawLength.toLocaleString()} chars</span>
            </div>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "6px 12px", fontSize: 12 }}>
              <span style={{ color: "#1d4ed8", fontWeight: 600 }}>After DOMPurify:</span>{" "}
              <span style={{ color: "#1e40af" }}>{result.stats.sanitizedLength.toLocaleString()} chars</span>
              {result.stats.rawVsSanitizedDiff > 0 && (
                <span style={{ color: "#dc2626", marginLeft: 6 }}>
                  (−{result.stats.rawVsSanitizedDiff.toLocaleString()} chars stripped)
                </span>
              )}
              {result.stats.rawVsSanitizedDiff === 0 && (
                <span style={{ color: "#16a34a", marginLeft: 6 }}>✓ nothing stripped</span>
              )}
            </div>
            <div style={{ background: "#fdf4ff", border: "1px solid #e9d5ff", borderRadius: 6, padding: "6px 12px", fontSize: 12 }}>
              <span style={{ color: "#7c3aed", fontWeight: 600 }}>Final (with tracking):</span>{" "}
              <span style={{ color: "#6d28d9" }}>{result.stats.finalLength.toLocaleString()} chars</span>
            </div>
          </div>

          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 2, borderBottom: "2px solid #e5e7eb", marginBottom: 16 }}>
            {(["preview", "source"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "6px 16px",
                  fontSize: 13,
                  fontWeight: activeTab === tab ? 600 : 400,
                  border: "none",
                  borderBottom: activeTab === tab ? "2px solid #6366f1" : "2px solid transparent",
                  background: "none",
                  cursor: "pointer",
                  color: activeTab === tab ? "#6366f1" : "#6b7280",
                  marginBottom: -2,
                }}
              >
                {tab === "preview" ? "Visual Preview" : "HTML Source"}
              </button>
            ))}
          </div>

          {activeTab === "preview" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
              <HtmlFrame html={result.raw} title="1. Raw Pasted HTML" />
              <HtmlFrame html={result.sanitized} title="2. After DOMPurify Sanitization" />
              <HtmlFrame html={result.final} title="3. Final Sent (+ tracking pixel)" />
            </div>
          )}

          {activeTab === "source" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <CodeBlock html={result.raw} label="1. Raw Pasted HTML" />
              <CodeBlock html={result.sanitized} label="2. After DOMPurify Sanitization" />
              <CodeBlock html={result.final} label="3. Final Sent (+ tracking pixel injected)" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
