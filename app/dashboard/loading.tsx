export default function DashboardLoading() {
  return (
    <main className="route-loading">
      <div className="route-spinner" />
      <span>Loading arena...</span>

      <style>{`
        .route-loading {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          color: #94a3b8;
          font-family: var(--font-heading);
          font-size: 1.2rem;
        }

        .route-spinner {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 3px solid rgba(124, 58, 237, 0.2);
          border-top-color: #7c3aed;
          animation: route-spin 0.9s linear infinite;
        }

        @keyframes route-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
