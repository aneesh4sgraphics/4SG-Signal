import React from "react";
import { fetchAndExtract, Contact } from "@/lib/api";
import ContactForm from "@/components/ContactForm";

export default function TextParserPage() {
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [finalUrl, setFinalUrl] = React.useState<string | null>(null);

  const [primary, setPrimary] = React.useState<Contact>({ confidence: 0 });
  const [alternatives, setAlternatives] = React.useState<Contact[]>([]);

  async function onFetch() {
    setLoading(true);
    setError(null);
    try {
      const out = await fetchAndExtract(url.trim());
      setPrimary(out.primary);
      setAlternatives(out.alternatives);
      setFinalUrl(out.finalUrl);
    } catch (e: any) {
      console.error("Text parser error:", e);
      setError(e?.message || "Failed to parse");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Text Parser</h1>
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          disabled={!url || loading}
          onClick={onFetch}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Fetching…" : "Fetch & Extract"}
        </button>
      </div>

      {finalUrl && (
        <div className="text-sm text-gray-600 mb-3">
          Parsed URL: <span className="font-mono">{finalUrl}</span>
        </div>
      )}

      {error && (
        <div className="border rounded p-3 bg-red-50 text-red-800 mb-3">
          {error}
        </div>
      )}

      {!error && primary && (
        <ContactForm value={primary} onChange={setPrimary} alternatives={alternatives} />
      )}
    </div>
  );
}