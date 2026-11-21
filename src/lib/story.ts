// Shared between the 3D story (canvas) and the page chrome (chapter rail, auto-scroll player).
export const CHAPTERS = ['Pembuka', 'Hari pertama', 'Hari ke-14', 'Tugas pertama', 'Akun kembar', 'Mengulang', 'Empat tingkat', 'Kapasitas', 'Kesenjangan', 'Mulai'];
// Scroll range from the page count (drei fills the scroller to pages × its height), never scrollHeight:
// anything overflowing inside the scroller would stretch scrollHeight and make progress jump.
export const scrollRange = (el: HTMLElement) => el.clientHeight * (CHAPTERS.length - 1);
// capacity = how many students the counselors reach in the capacity chapter (10 counselors × 80 by default)
export const story = { playing: false, speed: 1, offset: 0, capacity: 800, el: null as HTMLElement | null };
