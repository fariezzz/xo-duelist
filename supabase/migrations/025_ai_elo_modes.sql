-- XO Duelist: AI ELO policy modes
-- dashboard VS AI -> no ELO change
-- matchmaking AI -> reduced ELO change

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS ai_elo_mode text NOT NULL DEFAULT 'reduced';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'game_rooms_ai_elo_mode_check'
  ) THEN
    ALTER TABLE game_rooms
      ADD CONSTRAINT game_rooms_ai_elo_mode_check
      CHECK (ai_elo_mode IN ('none', 'reduced'));
  END IF;
END $$;

UPDATE game_rooms
SET ai_elo_mode = 'reduced'
WHERE is_vs_ai = true
  AND (ai_elo_mode IS NULL OR ai_elo_mode NOT IN ('none', 'reduced'));

DROP FUNCTION IF EXISTS create_ai_match(text);
DROP FUNCTION IF EXISTS create_ai_match(text, text);

create or replace function create_ai_match(
  input_difficulty text default 'adaptive',
  input_origin text default 'dashboard'
)
returns table (
  room_id uuid,
  player1_id uuid,
  player2_id uuid
)
language plpgsql
security definer
as $$
declare
  me_id uuid;
  bot_id uuid := 'a0000000-0000-0000-0000-000000000001';
  room_code_val text;
  picked_cells integer[];
  normalized_origin text;
  elo_mode text;
begin
  me_id := auth.uid();
  if me_id is null then
    raise exception 'not authenticated';
  end if;

  normalized_origin := lower(coalesce(input_origin, 'dashboard'));
  if normalized_origin not in ('dashboard', 'matchmaking') then
    normalized_origin := 'dashboard';
  end if;
  elo_mode := case
    when normalized_origin = 'dashboard' then 'none'
    else 'reduced'
  end;

  -- Pick 4 distinct non-corner cells for power/curse cells
  select array_agg(v)
  into picked_cells
  from (
    select v
    from unnest(array[1,2,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23]) as v
    order by random()
    limit 4
  ) s;

  -- Generate unique room code
  loop
    room_code_val := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into game_rooms (
        room_code,
        player1_id,
        player2_id,
        board_state,
        current_turn,
        status,
        winner_id,
        player1_symbol,
        player2_symbol,
        last_move_at,
        created_at,
        turn_count,
        next_shuffle_at,
        power_cells,
        curse_cells,
        is_vs_ai,
        ai_difficulty,
        ai_elo_mode
      ) values (
        room_code_val,
        me_id,
        bot_id,
        '[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]'::jsonb,
        me_id,
        'ongoing',
        null,
        'X',
        'O',
        now(),
        now(),
        0,
        12,
        jsonb_build_array(
          jsonb_build_object('index', picked_cells[1], 'claimed', false),
          jsonb_build_object('index', picked_cells[2], 'claimed', false)
        ),
        jsonb_build_array(
          jsonb_build_object('index', picked_cells[3], 'triggered', false),
          jsonb_build_object('index', picked_cells[4], 'triggered', false)
        ),
        true,
        input_difficulty,
        elo_mode
      );
      exit;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  return query
  select g.id, g.player1_id, g.player2_id
  from game_rooms g
  where g.room_code = room_code_val
  order by g.created_at desc
  limit 1;
end;
$$;

create or replace function finalize_game(input_room_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  room_record game_rooms%rowtype;
  p1 profiles%rowtype;
  p2 profiles%rowtype;
  expected1 numeric;
  expected2 numeric;
  k1 numeric;
  k2 numeric;
  new1 integer;
  new2 integer;
  winner_id uuid;
  loser_id uuid;
  winner_elo_before integer;
  winner_elo_after integer;
  loser_elo_before integer;
  loser_elo_after integer;
  is_lobby_room boolean;
  v_match_type text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into room_record
  from game_rooms
  where game_rooms.id = input_room_id
  for update;

  if not found then
    raise exception 'room_not_found';
  end if;

  if room_record.status <> 'finished' then
    raise exception 'room_not_finished';
  end if;

  -- Prevent duplicate finalization
  if exists (select 1 from match_history where room_id = input_room_id) then
    return;
  end if;

  select * into p1 from profiles where profiles.id = room_record.player1_id;

  is_lobby_room := coalesce(room_record.player1_ready, false) and coalesce(room_record.player2_ready, false);

  -- VS AI path: apply policy by ai_elo_mode
  if room_record.is_vs_ai then
    winner_elo_before := p1.elo_rating;
    loser_elo_before := p1.elo_rating;

    if coalesce(room_record.ai_elo_mode, 'reduced') = 'none' then
      v_match_type := 'ai_casual';

      if room_record.winner_id is null then
        new1 := p1.elo_rating;
        update profiles set draws = draws + 1 where id = p1.id;
        winner_id := null;
        loser_id := null;
        winner_elo_after := new1;
        loser_elo_after := new1;
      elsif room_record.winner_id = p1.id then
        new1 := p1.elo_rating;
        update profiles set wins = wins + 1 where id = p1.id;
        winner_id := p1.id;
        loser_id := room_record.player2_id;
        winner_elo_after := new1;
        loser_elo_after := new1;
      else
        new1 := p1.elo_rating;
        update profiles set losses = losses + 1 where id = p1.id;
        winner_id := room_record.player2_id;
        loser_id := p1.id;
        winner_elo_after := new1;
        loser_elo_after := new1;
      end if;
    else
      v_match_type := 'ai_ranked';

      if room_record.winner_id is null then
        -- Draw: +1 ELO
        new1 := p1.elo_rating + 1;
        update profiles set elo_rating = new1, draws = draws + 1 where id = p1.id;
        winner_id := null;
        loser_id := null;
        winner_elo_after := new1;
        loser_elo_after := new1;
      elsif room_record.winner_id = p1.id then
        -- Win vs matchmaking bot: small gain
        new1 := p1.elo_rating + 3;
        update profiles set elo_rating = new1, wins = wins + 1 where id = p1.id;
        winner_id := p1.id;
        loser_id := room_record.player2_id;
        winner_elo_after := new1;
        loser_elo_after := p1.elo_rating;
      else
        -- Loss vs matchmaking bot: small loss
        new1 := p1.elo_rating - 2;
        update profiles set elo_rating = new1, losses = losses + 1 where id = p1.id;
        winner_id := room_record.player2_id;
        loser_id := p1.id;
        winner_elo_after := p1.elo_rating;
        loser_elo_after := new1;
      end if;
    end if;

    insert into match_history (
      room_id, player1_id, player2_id, winner_id, loser_id,
      winner_elo_before, winner_elo_after,
      loser_elo_before, loser_elo_after,
      played_at, match_type
    ) values (
      room_record.id, room_record.player1_id, room_record.player2_id,
      winner_id, loser_id,
      winner_elo_before, winner_elo_after,
      loser_elo_before, loser_elo_after,
      now(), v_match_type
    );
    return;
  end if;

  -- Normal PVP path
  v_match_type := 'pvp';
  select * into p2 from profiles where profiles.id = room_record.player2_id;

  if p1.id is null or p2.id is null then
    raise exception 'profiles_missing';
  end if;

  expected1 := 1 / (1 + power(10, ((p2.elo_rating - p1.elo_rating) / 400.0)));
  expected2 := 1 / (1 + power(10, ((p1.elo_rating - p2.elo_rating) / 400.0)));

  if p1.elo_rating < 1000 then k1 := 32; elsif p1.elo_rating < 1200 then k1 := 24; else k1 := 16; end if;
  if p2.elo_rating < 1000 then k2 := 32; elsif p2.elo_rating < 1200 then k2 := 24; else k2 := 16; end if;

  if room_record.winner_id is null then
    if is_lobby_room then
      update profiles set draws = draws + 1 where id = p1.id;
      update profiles set draws = draws + 1 where id = p2.id;
      new1 := p1.elo_rating;
      new2 := p2.elo_rating;
    else
      new1 := round(p1.elo_rating + k1 * (0.5 - expected1));
      new2 := round(p2.elo_rating + k2 * (0.5 - expected2));
      update profiles set elo_rating = new1, draws = draws + 1 where id = p1.id;
      update profiles set elo_rating = new2, draws = draws + 1 where id = p2.id;
    end if;

    winner_id := null;
    loser_id := null;
    winner_elo_before := p1.elo_rating;
    winner_elo_after := new1;
    loser_elo_before := p2.elo_rating;
    loser_elo_after := new2;
  else
    if room_record.winner_id = p1.id then
      winner_id := p1.id;
      loser_id := p2.id;
    else
      winner_id := p2.id;
      loser_id := p1.id;
    end if;

    if winner_id = p1.id then
      if is_lobby_room then
        update profiles set wins = wins + 1 where id = p1.id;
        update profiles set losses = losses + 1 where id = p2.id;
        new1 := p1.elo_rating;
        new2 := p2.elo_rating;
      else
        new1 := round(p1.elo_rating + k1 * (1 - expected1));
        new2 := round(p2.elo_rating + k2 * (0 - expected2));
        update profiles set elo_rating = new1, wins = wins + 1 where id = p1.id;
        update profiles set elo_rating = new2, losses = losses + 1 where id = p2.id;
      end if;
      winner_elo_before := p1.elo_rating;
      winner_elo_after := new1;
      loser_elo_before := p2.elo_rating;
      loser_elo_after := new2;
    else
      if is_lobby_room then
        update profiles set losses = losses + 1 where id = p1.id;
        update profiles set wins = wins + 1 where id = p2.id;
        new1 := p1.elo_rating;
        new2 := p2.elo_rating;
      else
        new2 := round(p2.elo_rating + k2 * (1 - expected2));
        new1 := round(p1.elo_rating + k1 * (0 - expected1));
        update profiles set elo_rating = new1, losses = losses + 1 where id = p1.id;
        update profiles set elo_rating = new2, wins = wins + 1 where id = p2.id;
      end if;
      winner_elo_before := p2.elo_rating;
      winner_elo_after := new2;
      loser_elo_before := p1.elo_rating;
      loser_elo_after := new1;
    end if;
  end if;

  insert into match_history (
    room_id, player1_id, player2_id, winner_id, loser_id,
    winner_elo_before, winner_elo_after,
    loser_elo_before, loser_elo_after,
    played_at, match_type
  ) values (
    room_record.id, room_record.player1_id, room_record.player2_id,
    winner_id, loser_id,
    winner_elo_before, winner_elo_after,
    loser_elo_before, loser_elo_after,
    now(), v_match_type
  );
end;
$$;
