# XO Duelist

**Competitive 5×5 Tic Tac Toe** — A real-time multiplayer strategy game with ELO rankings, skill systems, and curse mechanics.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| UI | React 19, Vanilla CSS |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions) |
| Session | @supabase/ssr |
| Audio | use-sound |
| Icons | Lucide React |
| Font | Rajdhani (Google Fonts) |

---

## Features

- 🎮 **Real-time PvP** via Supabase Realtime
- 🤖 **VS AI** with multiple difficulty personas
- 🏋️ **Training Mode** against local AI
- 🏠 **Lobby System** — create/join rooms via room code
- ⚡ **Skill System** — BARRIER, OVERWRITE, BOMB
- 💀 **Curse System** — BLIND, SLOW, FUMBLE
- 🌀 **Board Shuffle** — every 12 turns
- 🏆 **ELO Ranking** with tier badges (Bronze → Diamond)
- 👥 **Friends System** — add, accept, invite to game
- 🔔 **Notifications** — real-time friend requests & game invites
- 📊 **Match History** — full game records
- 👤 **Public Profiles** — view any player's stats
- 🌐 **OAuth** — Google, GitHub, Discord login

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [npm](https://www.npmjs.com/) v9+
- A [Supabase](https://supabase.com) project (free tier works)

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/xo-duelist.git
cd xo-duelist
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example env file and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> Find these in: **Supabase Dashboard → Project Settings → API**

### 4. Run database migrations

Apply all migrations to your Supabase project in order. You can do this via the **Supabase Dashboard → SQL Editor**, or using the Supabase CLI:

```bash
# Using Supabase CLI (recommended)
supabase db push

# Or manually run each file in order via SQL Editor:
# supabase/migrations/001_initial.sql
# supabase/migrations/002_lobby_room_code.sql
# ... (up to 041_voice_signaling_validation.sql)
```

There are **41 migration files** in `supabase/migrations/`. They must be applied in numerical order.

### 5. Deploy Edge Functions

Two Edge Functions are required:

```bash
supabase functions deploy set-offline
supabase functions deploy signup-with-rate-limit
```

> The `set-offline` function handles presence beacon when a user closes the browser tab.

### 6. Configure Supabase Realtime

In **Supabase Dashboard → Database → Replication**, ensure the following tables have Realtime enabled:

- `game_rooms`
- `profiles`
- `friend_requests`
- `game_invites`
- `voice_signals`
- `matchmaking_queue`

### 7. Set up Row Level Security (RLS)

After running migrations, apply the RLS fixes:

```sql
-- Run in Supabase SQL Editor:
-- Contents of supabase/fix_all_permissions.sql
```

Or paste the contents of `supabase/fix_all_permissions.sql` directly into the SQL Editor.

### 8. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## OAuth Login Setup

To enable Google, GitHub, and Discord login, see the detailed guide:

📄 **[OAUTH_SETUP.md](./OAUTH_SETUP.md)**

---

## Project Structure

```
xo-duelist/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Landing / login page
│   ├── dashboard/          # Main dashboard
│   ├── game/[roomId]/      # Game room (real-time)
│   ├── matchmaking/        # Ranked matchmaking queue
│   ├── lobby/              # Lobby browser & room creation
│   ├── friends/            # Friends management
│   ├── history/            # Match history
│   ├── leaderboard/        # ELO leaderboard
│   ├── profile/            # Own profile
│   ├── profile/[username]/ # Public player profiles
│   ├── training/           # VS Local AI (no ELO)
│   └── auth/               # OAuth callback handler
├── components/             # Reusable UI components
├── hooks/                  # Custom React hooks
│   ├── usePresence.ts      # Real-time online presence
│   ├── useStatusManager.ts # Player status (in_game, online, etc.)
│   └── ...
├── lib/                    # Utilities & game logic
│   ├── mechanics.ts        # Skills, curses, shuffle, power cells
│   ├── gameLogic.ts        # Win/draw detection
│   ├── aiPlayer.ts         # AI move engine
│   └── supabase.ts         # Supabase client
├── context/                # React contexts (Notifications)
├── styles/                 # Global CSS
├── supabase/
│   ├── migrations/         # 41 SQL migration files
│   └── functions/          # Edge Functions
│       ├── set-offline/
│       └── signup-with-rate-limit/
└── public/
    └── sounds/             # In-game sound effects
```

---

## Game Mechanics

### Board
- **5×5 grid** — 4 in a row wins

### Power Cells (⚡)
Stepping on a Power Cell grants a random skill:
| Skill | Effect |
|---|---|
| BARRIER 🛡️ | Place a wall that blocks that cell |
| OVERWRITE ✏️ | Replace any opponent's symbol with yours |
| BOMB 💣 | Destroy any cell, clearing its content |

### Curse Cells (💀)
Stepping on a Curse Cell inflicts a random curse:
| Curse | Effect |
|---|---|
| BLIND 🌑 | All board cells appear as `?` |
| SLOW 🐢 | Timer is reduced for your turns |
| FUMBLE 🎲 | Your moves are placed on a random empty cell |

### Board Shuffle 🌀
Every **12 turns**, all pieces on the board are randomly repositioned.

---

## ELO Tiers

| Tier | ELO Range |
|---|---|
| 🥉 Bronze | 0 – 799 |
| 🥈 Silver | 800 – 999 |
| 🥇 Gold | 1000 – 1199 |
| 💎 Platinum | 1200 – 1399 |
| 👑 Diamond | 1400+ |

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key (safe for client) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server-only) |
| `VERCEL_URL` | Optional | Auto-set by Vercel on deployment |

---

## Deployment (Vercel)

1. Push to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Add all environment variables from `.env.local.example` in the Vercel dashboard
4. Deploy — Vercel auto-detects Next.js

> Make sure your Supabase **Site URL** and **Redirect URLs** include your Vercel production domain. See [OAUTH_SETUP.md](./OAUTH_SETUP.md) for details.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run seed` | Seed database with test data |

---

## License

Private project — all rights reserved.
