import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { nanoid } from "nanoid";

const pdfPath = "data/troubleshooting-pdfs/printing-troubleshooting-guide.pdf";
const buf = fs.readFileSync(pdfPath);
const parsed = await pdfParse(buf);

console.log("Total text length:", parsed.text.length);
console.log("Total words:", parsed.text.split(/\s+/).length);

function chunkText(text, tokensPerChunk = 300, overlap = 50) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += (tokensPerChunk - overlap)) {
    const slice = words.slice(i, i + tokensPerChunk).join(" ").trim();
    if (slice.length > 100) chunks.push({ id: nanoid(), text: slice });
  }
  return chunks;
}

const chunks = chunkText(parsed.text.replace(/\n{2,}/g, "\n"));
console.log("Total chunks created:", chunks.length);
