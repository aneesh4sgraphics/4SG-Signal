import fs from "fs";
import path from "path";
import fg from "fast-glob";
import pdfParse from "pdf-parse";
import winkUtils from "wink-nlp-utils";
import { nanoid } from "nanoid";

function chunkText(text: string, tokensPerChunk = 900, overlap = 120) {
  const words = text.split(/\s+/);
  const chunks: { id: string; text: string }[] = [];
  for (let i = 0; i < words.length; i += (tokensPerChunk - overlap)) {
    const slice = words.slice(i, i + tokensPerChunk).join(" ").trim();
    if (slice.length > 200) chunks.push({ id: nanoid(), text: slice });
  }
  return chunks;
}

(async () => {
  const pdfDir = "data/troubleshooting-pdfs";
  
  // Check if directory exists
  if (!fs.existsSync(pdfDir)) {
    console.log(`Creating ${pdfDir} directory...`);
    fs.mkdirSync(pdfDir, { recursive: true });
    console.log(`Please add your PDF files to ${pdfDir} and run this script again.`);
    process.exit(0);
  }
  
  const files = await fg(["**/*.pdf"], { cwd: pdfDir, absolute: true });
  
  if (files.length === 0) {
    console.log(`No PDF files found in ${pdfDir}`);
    console.log("Please add your troubleshooting PDF files and run this script again.");
    process.exit(0);
  }

  const chunks: any[] = [];
  for (const file of files) {
    const buf = fs.readFileSync(file);
    const parsed = await pdfParse(buf);
    const base = path.basename(file);
    const text = parsed.text.replace(/\n{2,}/g, "\n");
    const c = chunkText(text);
    c.forEach((ck, i) =>
      chunks.push({ id: ck.id, file: base, pageHint: i + 1, text: ck.text })
    );
  }

  const bm25 = await import("wink-bm25-text-search");
  const model = bm25.default();
  const prep = winkUtils;
  
  model.defineConfig({ fldWeights: { text: 1 } });
  model.definePrepTasks([
    prep.string.lowerCase,
    prep.string.removePunctuations,
    prep.string.tokenize0,
    prep.tokens.stem,
    prep.tokens.removeWords
  ]);
  
  chunks.forEach((ch) => model.addDoc({ text: ch.text, id: ch.id, file: ch.file }, ch.id));
  
  // Handle consolidation with fallback
  try {
    model.consolidate();
  } catch (e) {
    // Add dummy doc if needed for consolidation
    if (chunks.length < 2) {
      model.addDoc({ text: "dummy", id: "dummy", file: "dummy" }, "dummy");
      model.consolidate();
    }
  }

  fs.mkdirSync("data/index", { recursive: true });
  fs.writeFileSync("data/index/chunks.json", JSON.stringify(chunks));
  fs.writeFileSync("data/index/bm25.json", JSON.stringify(model.exportJSON()));
  console.log(`Ingested ${files.length} PDFs → ${chunks.length} text chunks.`);
})();