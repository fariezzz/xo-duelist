import Navbar from "../../../components/Navbar";

export default function PublicProfileLoading() {
  return (
    <>
      <Navbar />
      <main className="pp-route-loading">
        <div className="pp-route-spinner" />
        <span>Loading profile...</span>

        <style>{`
          .pp-route-loading {
            min-height: 100vh;
            padding: calc(var(--navbar-height) + 32px) 20px 40px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 14px;
            color: #94a3b8;
            font-family: var(--font-heading);
            font-size: 1.05rem;
          }

          .pp-route-spinner {
            width: 40px;
            height: 40px;
            border-radius: 999px;
            border: 3px solid rgba(124, 58, 237, 0.2);
            border-top-color: #7c3aed;
            animation: pp-route-spin 0.9s linear infinite;
          }

          @keyframes pp-route-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </main>
    </>
  );
}
