# XO Duelist

Competitive 5x5 Tic Tac Toe with real-time multiplayer, matchmaking, and ELO ranking.

Tech: Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase (Postgres, Realtime, Auth, Edge Functions), Vercel

## Quick Start — Detailed Setup

### Step 1: Create Supabase Project
1. Go to https://supabase.com and sign up / log in
2. Click **"New Project"**
3. Enter a project name (e.g., "xo-duelist")
4. Set a strong database password
5. Choose a region close to you
6. Click **"Create New Project"** and wait for it to initialize (2-3 minutes)

### Step 2: Get Supabase Credentials
Once your project is ready:
1. Go to **Settings > API** (left sidebar)
2. Copy the **Project URL** (looks like `https://xxx.supabase.co`)
3. Copy the **`anon` public key** under "Project API keys"
4. Copy the **`service_role` secret key** under "Project API keys"

### Step 3: Create `.env.local`
In your project root, create a file named `.env.local` and paste:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-paste-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-paste-here
```

Replace with your actual credentials from Step 2.

### Step 4: Enable Email Authentication
1. In Supabase dashboard, go to **Authentication > Providers**
2. Make sure **Email** is enabled (toggle "ON")
3. Go to **Email Templates** and verify the confirmation email looks good

### Step 5: Create Database Tables
1. In Supabase, go to **SQL Editor**
2. Click **"New Query"**
3. Copy and paste the entire contents of `supabase/migrations/001_initial.sql`
4. Click **"Run"** to create all tables and RLS policies

### Step 6: Enable Realtime
1. In Supabase, go to **Database > Replication**
2. Under "Replication" toggle ON for the `game_rooms` table (for real-time game sync)
3. Optionally enable for `matchmaking_queue` and `profiles`

### Step 7: Run Locally
```bash
npm install
npx next dev
```

Open http://localhost:3000 and **Register** to create your first account!

## Database Seeding

Want test data? Run the seeder to create 4 test users with sample profiles:

```bash
npm run seed
```

This will create:
- **alice@example.com** / password123
- **bob@example.com** / password123
- **charlie@example.com** / password123
- **diana@example.com** / password123

Each with random ELO ratings and win/loss records. You can log in with any of these accounts at http://localhost:3000.

Project structure

- `app/` — Next.js app routes and pages
- `components/` — React UI components
- `lib/` — Supabase client and game helpers
- `supabase/migrations/` — SQL to bootstrap database

Notes & operational details

- Authentication: register/login using Supabase Auth. On first login the app attempts to create a `profiles` row for the user.
- Matchmaking: the page `/matchmaking` inserts a row into `matchmaking_queue`. For a production-safe atomic matching flow, replace the client polling with a server-side RPC that performs a transactional match selection (SELECT ... FOR UPDATE SKIP LOCKED) and creates a `game_rooms` row atomically.
- Lobby rooms: the page `/lobby` lets a player create a room code or join an existing room by code. Hosts wait on `/lobby/[roomId]` and automatically move to `/game/[roomId]` once the second player joins.
- Game rooms sync: the app listens for `game_rooms` changes via Supabase Realtime channels.
- ELO recalculation and match history are handled by database RPC/migration logic.

Styling & UI

- Tailwind CSS is used; theme colors follow the requested palette. Add or tune Tailwind config if needed.

Deployment

- Deploy the app to Vercel, and set the environment variables in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (the service role key should be kept secret).

Security & RLS

- The migration enables Row Level Security and adds basic policies so users can only modify their own queue rows and profiles. Review policies and tighten them for production.

Further improvements

- Add server-side transactional matchmaking (recommended) as a Postgres function or Edge Function.
- Harden RLS policies to limit `game_rooms` updates to only valid moves and only allow players to update their games.
- Add retry/optimistic conflict handling and move validation on server to prevent cheating.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
