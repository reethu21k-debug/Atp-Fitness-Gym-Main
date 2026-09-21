import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/shared/theme-provider';
import { QueryProvider } from '@/components/shared/query-provider';
import { Preloader } from '@/components/shared/preloader';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

// Never throws: skips empty, whitespace-only, or malformed values
function getBaseUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
  ];

  for (const c of candidates) {
    const value = c?.trim();
    if (!value) continue;
    try {
      return new URL(value).toString();
    } catch {
      // not a valid absolute URL (e.g. missing https://), try the next one
    }
  }
  return 'http://localhost:3000';
}

export const metadata: Metadata = {
  title: { default: 'ATP Fitness — Train Different', template: '%s · ATP Fitness' },
  description:
    'ATP Fitness is a modern strength and conditioning gym in Anantapur. Personal training, group classes, and a members app to track it all.',
  metadataBase: new URL(getBaseUrl()),
  openGraph: {
    title: 'ATP Fitness — Train Different',
    description: 'Personal training, group classes, and a members app to track it all.',
    type: 'website',
  },
};

const THEME_BOOT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('atp-fitness-theme');
    var theme = stored || 'light'; 
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${inter.variable} font-sans bg-white text-[#1A1A1A] min-h-screen`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <QueryProvider>
            <Preloader />
            {children}
            <Toaster richColors position="top-right" />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}