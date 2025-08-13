import fs from "fs";
import path from "path";
import fg from "fast-glob";
import pdfParse from "pdf-parse";
import winkUtils from "wink-nlp-utils";
import { nanoid } from "nanoid";

// Simple chunker for text - creates smaller chunks to ensure we have enough for BM25
function chunkText(text: string, tokensPerChunk = 300, overlap = 50) {
  const words = text.split(/\s+/);
  const chunks: { id: string; text: string }[] = [];
  for (let i = 0; i < words.length; i += (tokensPerChunk - overlap)) {
    const slice = words.slice(i, i + tokensPerChunk).join(" ").trim();
    if (slice.length > 100) chunks.push({ id: nanoid(), text: slice });
  }
  return chunks;
}

(async () => {
  const pdfDir = "data/troubleshooting-pdfs";
  
  // Check if directory exists and has PDFs
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
  
  const docs: any[] = [];
  const chunks: any[] = [];

  console.log(`Found ${files.length} PDF files to process...`);

  for (const file of files) {
    try {
      console.log(`Processing: ${path.basename(file)}`);
      const buf = fs.readFileSync(file);
      const parsed = await pdfParse(buf);
      const base = path.basename(file);
      const text = parsed.text.replace(/\n{2,}/g, "\n");
      const c = chunkText(text);
      c.forEach((ck, i) => {
        chunks.push({
          id: ck.id,
          file: base,
          pageHint: Math.ceil((i + 1) * parsed.numpages / c.length), // Better page estimation
          text: ck.text
        });
      });
      docs.push({ file: base, bytes: buf.length, chunkCount: c.length });
    } catch (error) {
      console.error(`Error processing ${path.basename(file)}:`, error);
    }
  }

  if (chunks.length === 0) {
    console.log("No chunks were created. Please check your PDF files.");
    process.exit(1);
  }

  // Build BM25 index
  const bm25 = await import("wink-bm25-text-search");
  const model = bm25.default();

  model.defineConfig({ fldWeights: { text: 1 } });
  model.definePrepTasks([
    winkUtils.string.lowerCase,
    winkUtils.string.removePunctuations,
    winkUtils.string.tokenize0,
    winkUtils.tokens.stem,
    winkUtils.tokens.removeWords
  ]);

  chunks.forEach((ch) => {
    model.addDoc({ text: ch.text, id: ch.id, file: ch.file }, ch.id);
  });
  
  // Consolidate the index - BM25 requires at least 2 documents
  try {
    if (chunks.length >= 2) {
      model.consolidate();
    } else {
      console.log("Note: Too few documents for BM25 consolidation, skipping optimization.");
      // For single document, add a dummy doc to enable consolidation
      if (chunks.length === 1) {
        model.addDoc({ text: "dummy document for consolidation", id: "dummy", file: "dummy" }, "dummy");
        model.consolidate();
      }
    }
  } catch (e) {
    console.log("Warning: Could not consolidate BM25 index:", e.message);
  }

  // Save the index
  fs.mkdirSync("data/index", { recursive: true });
  fs.writeFileSync("data/index/chunks.json", JSON.stringify(chunks, null, 2));
  fs.writeFileSync("data/index/bm25.json", JSON.stringify(model.exportJSON()));
  fs.writeFileSync("data/index/manifest.json", JSON.stringify({ 
    docs, 
    createdAt: new Date().toISOString(),
    totalChunks: chunks.length
  }, null, 2));

  console.log(`✅ Ingested ${files.length} PDFs → ${chunks.length} chunks.`);
  console.log(`Index saved to data/index/`);
})();