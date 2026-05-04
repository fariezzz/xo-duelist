-- Disable ELO gain/loss for private lobby rooms to reduce ELO boosting abuse.
-- Lobby rooms are identified by both players having set READY before start.

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

  select * into p1 from profiles where profiles.id = room_record.player1_id;
  select * into p2 from profiles where profiles.id = room_record.player2_id;

  if p1.id is null or p2.id is null then
    raise exception 'profiles_missing';
  end if;

  is_lobby_room := coalesce(room_record.player1_ready, false) and coalesce(room_record.player2_ready, false);

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
    room_id,
    player1_id,
    player2_id,
    winner_id,
    loser_id,
    winner_elo_before,
    winner_elo_after,
    loser_elo_before,
    loser_elo_after,
    played_at
  ) values (
    room_record.id,
    room_record.player1_id,
    room_record.player2_id,
    winner_id,
    loser_id,
    winner_elo_before,
    winner_elo_after,
    loser_elo_before,
    loser_elo_after,
    now()
  );
end;
$$;
