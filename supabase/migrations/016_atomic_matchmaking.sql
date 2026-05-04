-- Atomic matchmaking to prevent one player being matched into multiple rooms concurrently.

create or replace function find_match_atomic(input_range integer default 200)
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
  my_entry matchmaking_queue%rowtype;
  opp_entry matchmaking_queue%rowtype;
  existing_room_id uuid;
  room_code_candidate text;
  picked_cells integer[];
  p1 uuid;
  p2 uuid;
begin
  me_id := auth.uid();
  if me_id is null then
    raise exception 'not authenticated';
  end if;

  -- If already matched, return latest ongoing room.
  select g.id into existing_room_id
  from game_rooms g
  where (g.player1_id = me_id or g.player2_id = me_id)
    and g.status = 'ongoing'
  order by g.created_at desc
  limit 1;

  if existing_room_id is not null then
    return query
    select g.id, g.player1_id, g.player2_id
    from game_rooms g
    where g.id = existing_room_id;
    return;
  end if;

  -- Lock current player queue row.
  select *
  into my_entry
  from matchmaking_queue q
  where q.player_id = me_id
  for update;

  if not found then
    return;
  end if;

  -- Find and lock one compatible opponent row.
  select *
  into opp_entry
  from matchmaking_queue q
  where q.player_id <> me_id
    and abs(q.elo_rating - my_entry.elo_rating) <= greatest(input_range, 0)
    and not exists (
      select 1
      from game_rooms g
      where (g.player1_id = q.player_id or g.player2_id = q.player_id)
        and g.status = 'ongoing'
    )
  order by q.joined_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  -- Randomize X/O assignment
  if random() < 0.5 then
    p1 := me_id;
    p2 := opp_entry.player_id;
  else
    p1 := opp_entry.player_id;
    p2 := me_id;
  end if;

  -- Pick 4 distinct non-corner cells (2 power + 2 curse)
  select array_agg(v)
  into picked_cells
  from (
    select v
    from unnest(array[1,2,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23]) as v
    order by random()
    limit 4
  ) s;

  -- Generate unique room code with retry
  loop
    room_code_candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
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
        curse_cells
      ) values (
        room_code_candidate,
        p1,
        p2,
        '[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]'::jsonb,
        p1,
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
        )
      );
      exit;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  -- Remove both players from queue atomically inside same transaction.
  delete from matchmaking_queue
  where player_id in (me_id, opp_entry.player_id);

  return query
  select g.id, g.player1_id, g.player2_id
  from game_rooms g
  where g.room_code = room_code_candidate
  order by g.created_at desc
  limit 1;
end;
$$;
