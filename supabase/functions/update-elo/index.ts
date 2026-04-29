import { serve } from 'std/server';
import { createClient } from '@supabase/supabase-js';

function kFactor(rating: number) {
  if (rating < 1000) return 32;
  if (rating < 1200) return 24;
  return 16;
}

function expectedScore(a: number, b: number) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function newRating(oldRating: number, opponentRating: number, actual: number) {
  const k = kFactor(oldRating);
  const exp = expectedScore(oldRating, opponentRating);
  return Math.round(oldRating + k * (actual - exp));
}

const url = Deno.env.get('SUPABASE_URL') || Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') || '';
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(url, key);

serve(async (req) => {
  try {
    const body = await req.json();
    const { room_id } = body;
    if (!room_id) return new Response(JSON.stringify({ error: 'room_id required' }), { status: 400 });

    // load game_room and involved players
    const { data: room } = await supabase.from('game_rooms').select('*').eq('id', room_id).single();
    if (!room) return new Response(JSON.stringify({ error: 'room not found' }), { status: 404 });

    const p1 = await supabase.from('profiles').select('*').eq('id', room.player1_id).single();
    const p2 = await supabase.from('profiles').select('*').eq('id', room.player2_id).single();
    if (!p1.data || !p2.data) return new Response(JSON.stringify({ error: 'profiles missing' }), { status: 500 });

    // Determine winner/loser
    const winner_id = room.winner_id;
    let loser_id = null;
    if (winner_id) loser_id = winner_id === room.player1_id ? room.player2_id : room.player1_id;

    const elo1 = p1.data.elo_rating;
    const elo2 = p2.data.elo_rating;

    let winner_elo_before = null, winner_elo_after = null, loser_elo_before = null, loser_elo_after = null;

    if (!winner_id) {
      // draw: both get 0.5
      const new1 = newRating(elo1, elo2, 0.5);
      const new2 = newRating(elo2, elo1, 0.5);
      await supabase.from('profiles').update({ elo_rating: new1, draws: p1.data.draws + 1 }).eq('id', p1.data.id);
      await supabase.from('profiles').update({ elo_rating: new2, draws: p2.data.draws + 1 }).eq('id', p2.data.id);
      winner_elo_before = elo1; winner_elo_after = new1;
      loser_elo_before = elo2; loser_elo_after = new2;
    } else {
      const winner = winner_id === p1.data.id ? p1.data : p2.data;
      const loser = loser_id === p1.data.id ? p1.data : p2.data;
      const newW = newRating(winner.elo_rating, loser.elo_rating, 1);
      const newL = newRating(loser.elo_rating, winner.elo_rating, 0);
      await supabase.from('profiles').update({ elo_rating: newW, wins: winner.wins + 1 }).eq('id', winner.id);
      await supabase.from('profiles').update({ elo_rating: newL, losses: loser.losses + 1 }).eq('id', loser.id);
      winner_elo_before = winner.elo_rating; winner_elo_after = newW;
      loser_elo_before = loser.elo_rating; loser_elo_after = newL;
    }

    // insert match_history
    await supabase.from('match_history').insert([{ room_id: room.id, player1_id: p1.data.id, player2_id: p2.data.id, winner_id: room.winner_id, loser_id: loser_id, winner_elo_before, winner_elo_after, loser_elo_before, loser_elo_after }]);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
