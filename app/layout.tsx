import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Kitchen & Lifestyle Study', description: 'A short independent consumer research survey.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
