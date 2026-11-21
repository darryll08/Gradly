import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter, Newsreader, Unbounded } from 'next/font/google';
import Shell from '@/components/Shell';
import './globals.css';

// Dashboard: Newsreader for titles and big numbers (a full, book-like serif), Inter for everything else.
// The /cerita story keeps its own pair (Unbounded + Bricolage).
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter' });
const serif = Newsreader({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-serif' });
const display = Unbounded({ subsets: ['latin'], weight: ['600', '800'], variable: '--font-display' });
const body = Bricolage_Grotesque({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Gradly — Peringatan Dini Akademik',
  description: 'Siapa yang berisiko gagal semester ini, kenapa, kapan harus ditolong, dan berapa yang bisa diselamatkan.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${inter.variable} ${serif.variable} ${display.variable} ${body.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
