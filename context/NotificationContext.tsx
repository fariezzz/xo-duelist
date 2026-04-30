"use client";
import React, { createContext, useCallback, useRef, useState } from "react";

/* ── Types ────────────────────────────────────────────── */
export type ToastType = "success" | "error" | "warning" | "info" | "special";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;       // ms
  createdAt: number;
  exiting?: boolean;
}

export interface BannerItem {
  id: string;
  type: ToastType;
  message: string;
  icon?: string;
  pulse?: boolean;
  exiting?: boolean;
}

export type ConnectionState = "connected" | "reconnecting" | "disconnected";

export interface NotificationAPI {
  /* Toast */
  toasts: ToastItem[];
  showToast(opts: { type: ToastType; title: string; message?: string; duration?: number }): string;
  dismissToast(id: string): void;
  /* Banner */
  banner: BannerItem | null;
  showBanner(opts: { type: ToastType; message: string; icon?: string; pulse?: boolean; duration?: number }): void;
  dismissBanner(): void;
  /* Connection */
  connectionStatus: ConnectionState;
  setConnectionStatus(s: ConnectionState): void;
}

/* ── Default durations by type (ms) ───────────────────── */
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  warning: 5000,
  error: 7000,
  special: 5000,
};

const MAX_TOASTS = 4;
let _toastCounter = 0;

/* ── Context ──────────────────────────────────────────── */
export const NotificationContext = createContext<NotificationAPI | null>(null);

/* ── Provider ─────────────────────────────────────────── */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [banner, setBanner] = useState<BannerItem | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>("connected");
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Toast helpers ── */
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    // Remove after exit animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 320);
  }, []);

  const showToast = useCallback(
    (opts: { type: ToastType; title: string; message?: string; duration?: number }): string => {
      const id = `toast-${++_toastCounter}`;
      const duration = opts.duration ?? DEFAULT_DURATIONS[opts.type];
      const item: ToastItem = { id, type: opts.type, title: opts.title, message: opts.message, duration, createdAt: Date.now() };

      setToasts((prev) => {
        let next = [...prev, item];
        // Evict oldest if over limit
        while (next.length > MAX_TOASTS) {
          next = next.slice(1);
        }
        return next;
      });

      // Auto-dismiss (errors stay until manually closed when no explicit duration)
      if (opts.type !== "error" || opts.duration) {
        setTimeout(() => dismissToast(id), duration);
      }

      return id;
    },
    [dismissToast],
  );

  /* ── Banner helpers ── */
  const dismissBanner = useCallback(() => {
    setBanner((prev) => (prev ? { ...prev, exiting: true } : null));
    setTimeout(() => setBanner(null), 320);
  }, []);

  const showBanner = useCallback(
    (opts: { type: ToastType; message: string; icon?: string; pulse?: boolean; duration?: number }) => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      const id = `banner-${++_toastCounter}`;
      setBanner({ id, type: opts.type, message: opts.message, icon: opts.icon, pulse: opts.pulse });
      const dur = opts.duration ?? 2000;
      bannerTimerRef.current = setTimeout(() => dismissBanner(), dur);
    },
    [dismissBanner],
  );

  const api: NotificationAPI = {
    toasts,
    showToast,
    dismissToast,
    banner,
    showBanner,
    dismissBanner,
    connectionStatus,
    setConnectionStatus,
  };

  return <NotificationContext.Provider value={api}>{children}</NotificationContext.Provider>;
}
