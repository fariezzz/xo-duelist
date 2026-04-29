-- Enable realtime for key tables

alter publication supabase_realtime add table game_rooms;
alter publication supabase_realtime add table profiles;
alter publication supabase_realtime add table match_history;
alter publication supabase_realtime add table matchmaking_queue;
