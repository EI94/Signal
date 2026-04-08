import type { Metadata } from 'next';
import '@signal/ui/tokens.css';
import '@signal/ui/primitives.css';
import { THEME_INIT_SCRIPT } from '../lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Signal',
  description: 'Enterprise intelligence platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: compile-time constant, not user input */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
