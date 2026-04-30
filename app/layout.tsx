import './globals.css';
import '../styles/notifications.css';
import React from 'react';
import { Rajdhani } from 'next/font/google';
import { NotificationProvider } from '../context/NotificationContext';
import ToastContainer from '../components/notifications/ToastContainer';

const rajdhani = Rajdhani({
  weight: ['500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
});

export const metadata = {
  title: 'XO Duelist — Competitive 5×5 Tic Tac Toe',
  description: 'Enter the arena. Play competitive 5×5 Tic Tac Toe, climb the ELO ladder, and prove your dominance.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={rajdhani.variable}>
        {/* Background atmosphere */}
        <div className="atmosphere" aria-hidden="true">
          <div className="orb orb-violet" />
          <div className="orb orb-gold" />
          <div className="orb orb-violet-sm" />
        </div>

        {/* App with notification system */}
        <NotificationProvider>
          {children}
          <ToastContainer />
        </NotificationProvider>
      </body>
    </html>
  );
}
