import fs from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { marked } from 'marked';

export const metadata = { title: 'سياسة الخصوصية — Guardian' };

// Rendered at build time from content/privacy-policy.md (our own file, not user input).
export default async function PrivacyPage() {
  const md = await fs.readFile(path.join(process.cwd(), 'content', 'privacy-policy.md'), 'utf8');
  const html = await marked.parse(md);
  return (
    <main className="container" style={{ maxWidth: 820 }}>
      <p className="small"><Link href="/">→ Guardian</Link></p>
      <article className="card" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
