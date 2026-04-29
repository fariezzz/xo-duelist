import './globals.css';
import React from 'react';

export const metadata = {
  title: 'XO Duelist — Competitive 5×5 Tic Tac Toe',
  description: 'Enter the arena. Play competitive 5×5 Tic Tac Toe, climb the ELO ladder, and prove your dominance.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Background atmosphere */}
        <div className="atmosphere" aria-hidden="true">
          <div className="orb orb-violet" />
          <div className="orb orb-gold" />
          <div className="orb orb-violet-sm" />
        </div>

        {/* Page content */}
        {children}
      </body>
    </html>
  );
}
