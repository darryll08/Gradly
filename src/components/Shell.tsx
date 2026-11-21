'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const NAV = [
  { href: '/', label: 'Ringkasan' },
  { href: '/antrian', label: 'Antrian Saya' },
  { href: '/mahasiswa', label: 'Daftar Mahasiswa' },
  { href: '/cek-risiko', label: 'Cek Risiko' },
  { href: '/anggaran', label: 'Simulasi Anggaran' },
  { href: '/kebijakan', label: 'Laporan & Kebijakan' },
];

/** Gradly mark: navy tile, white mortarboard, coral tassel dot. Shared with the /cerita story. */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="13" fill="#1F3A5F" />
      <path d="M9 22 24 15l15 7-15 7z" fill="#fff" />
      <path d="M15 25.5v5.2c0 2.4 4 4.3 9 4.3s9-1.9 9-4.3v-5.2L24 29.7z" fill="#fff" opacity=".82" />
      <path d="M37 22.5v5.5" stroke="#fff" strokeWidth="1.8" />
      <circle cx="37" cy="31" r="3" fill="#E4572E" />
    </svg>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState('');
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  // The scroll story is full-screen and brings its own top bar.
  if (path.startsWith('/cerita')) return <>{children}</>;

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand"><Mark size={26} /><span>Gradly<i>.</i></span></Link>
        <nav className="nav" aria-label="Navigasi">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined}>{item.label}</Link>
          ))}
        </nav>
        <div className="topbar-end">
          <form
            className="search"
            role="search"
            onSubmit={(e) => { e.preventDefault(); const id = q.trim(); if (id) router.push(`/mahasiswa/${id}`); }}
          >
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" strokeLinecap="round" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, ''))} placeholder="Cari ID mahasiswa" inputMode="numeric" aria-label="Cari ID mahasiswa" />
          </form>
          <Link className="cta-story" href="/cerita">Cerita <b>28</b> hari <span aria-hidden>↗</span></Link>
        </div>
      </header>
      <div className="main">{children}</div>
    </>
  );
}
