"use client";
import { useContext } from "react";
import { NotificationContext, NotificationAPI } from "../context/NotificationContext";

export function useNotification(): NotificationAPI {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification must be used within <NotificationProvider>");
  return ctx;
}
