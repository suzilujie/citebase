import { readdir } from 'node:fs/promises';
import { ingestDocument } from '../ingest/store';
import { corpusStats } from '../retrieve/search';
import { ensureSamplePdf } from './make-sample-pdf';

// Loads evals/docs into the library so the app is useful the moment it starts.
// Ingestion deduplicates by content hash, so running this repeatedly is free.

const DIR = `${import.meta.dir}/../../evals/docs`;

function mimeOf(name: string): string {
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.md')) return 'text/markdown';
  return 'text/plain';
}

async function main(): Promise<void> {
  await ensureSamplePdf();

  // The demo corpus is a convenience, not a fixture: once the library has real
  // documents, seeding would only add noise. --force overrides that.
  const force = process.argv.includes('--force');
  const stats = await corpusStats();
  if (stats.documents > 0 && !force) {
    console.log(
      `[seed] library already has ${stats.documents} documents, skipping (use --force to add samples)`,
    );
    return;
  }

  const files = (await readdir(DIR)).filter((f) => /\.(pdf|md|txt)$/i.test(f)).sort();
  if (files.length === 0) {
    console.log('[seed] no sample documents found in evals/docs');
    return;
  }

  for (const filename of files) {
    const bytes = new Uint8Array(await Bun.file(`${DIR}/${filename}`).arrayBuffer());
    const { doc, duplicate } = await ingestDocument({ filename, mime: mimeOf(filename), bytes });

    if (doc.status === 'failed') {
      console.log(`[seed] FAILED  ${filename}: ${doc.error ?? 'unknown error'}`);
      continue;
    }
    const tag = duplicate ? 'skipped ' : 'ingested';
    console.log(
      `[seed] ${tag} ${filename}: ${doc.chunk_count} chunks, ${doc.page_count} pages (${doc.id.slice(0, 8)})`,
    );
  }
}

await main();
process.exit(0);
