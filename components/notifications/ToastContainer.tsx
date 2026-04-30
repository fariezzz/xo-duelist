"use client";
import React from "react";
import { useNotification } from "../../hooks/useNotification";
import Toast from "./Toast";

export default function ToastContainer() {
  const { toasts, dismissToast } = useNotification();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
