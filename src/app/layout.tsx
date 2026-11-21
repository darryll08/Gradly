import type { Metadata } from 'next';
import Shell from '@/components/Shell';
import './globals.css';

// Dashboard: Newsreader for titles and big numbers (a full, book-like serif), Inter for everything else.
// The /cerita story keeps its own pair (Unbounded + Bricolage).
// Loaded from Google Fonts in the browser: next/font/google fails to fetch these at build time on Vercel.
const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:wght@400;500'
  + '&family=Unbounded:wght@600;800&family=Bricolage+Grotesque:wght@400;500;700&display=swap';
const VARS = `:root{--font-inter:'Inter',system-ui,sans-serif;--font-serif:'Newsreader',Georgia,serif;`
  + `--font-display:'Unbounded',system-ui,sans-serif;--font-body:'Bricolage Grotesque',system-ui,sans-serif}`;

export const metadata: Metadata = {
  title: 'Gradly — Peringatan Dini Akademik',
  description: 'Siapa yang berisiko gagal semester ini, kenapa, kapan harus ditolong, dan berapa yang bisa diselamatkan.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
        <style>{VARS}</style>
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
