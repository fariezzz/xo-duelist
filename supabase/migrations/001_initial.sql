-- Migration: initial schema for XO Duelist
-- Run this in your Supabase SQL editor or via psql

create extension if not exists pgcrypto;

-- profiles table
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  elo_rating integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  created_at timestamp with time zone default now()
);

-- matchmaking_queue
create table if not exists matchmaking_queue (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references profiles(id) on delete cascade,
  elo_rating integer not null,
  joined_at timestamp with time zone default now()
);

create index on matchmaking_queue (elo_rating);

-- game_rooms
create table if not exists game_rooms (
  id uuid primary key default gen_random_uuid(),
  player1_id uuid not null references profiles(id) on delete cascade,
  player2_id uuid,
  board_state jsonb not null default ('[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]'::jsonb),
  current_turn uuid,
  status text not null default 'waiting',
  winner_id uuid,
  player1_symbol text not null default 'X',
  player2_symbol text not null default 'O',
  last_move_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

create index on game_rooms (status);

-- match_history
create table if not exists match_history (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references game_rooms(id) on delete cascade,
  player1_id uuid not null,
  player2_id uuid not null,
  winner_id uuid,
  loser_id uuid,
  winner_elo_before integer,
  winner_elo_after integer,
  loser_elo_before integer,
  loser_elo_after integer,
  played_at timestamp with time zone default now()
);

-- Row Level Security and Policies
-- Enable RLS on tables where appropriate
alter table profiles enable row level security;
alter table matchmaking_queue enable row level security;
alter table game_rooms enable row level security;
alter table match_history enable row level security;

-- Profiles: allow users to insert their own profile when auth.uid = id
create policy "profiles_insert_if_auth" on profiles
  for insert with check (auth.uid() = id);

create policy "profiles_select" on profiles
  for select using (true);

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Matchmaking queue: players can insert/remove their own rows and select
create policy "queue_insert_own" on matchmaking_queue
  for insert with check (player_id = auth.uid());

create policy "queue_select" on matchmaking_queue
  for select using (true);

create policy "queue_delete_own" on matchmaking_queue
  for delete using (player_id = auth.uid());

create policy "queue_update_own" on matchmaking_queue
  for update using (player_id = auth.uid()) with check (player_id = auth.uid());

-- Game rooms: allow players to insert a room when they are player1, and
-- allow players (player1/player2) to select and update limited fields
create policy "game_rooms_insert" on game_rooms
  for insert with check (auth.uid() = player1_id);

create policy "game_rooms_select" on game_rooms
  for select using (player1_id = auth.uid() or player2_id = auth.uid());

create policy "game_rooms_update_players" on game_rooms
  for update using (player1_id = auth.uid() or player2_id = auth.uid()) with check (player1_id = auth.uid() or player2_id = auth.uid());

-- Allow match_history select for involved players
create policy "match_history_select_involved" on match_history
  for select using (player1_id = auth.uid() or player2_id = auth.uid());
