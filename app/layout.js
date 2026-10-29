import './globals.css';

export const metadata = {
  title: 'Daily Execution Coach',
  description: 'Prioritize, execute, follow up.',
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
