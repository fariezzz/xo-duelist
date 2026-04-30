-- Enable realtime for key tables

do $$
begin
	if not exists (
		select 1
		from pg_publication
		where pubname = 'supabase_realtime'
	) then
		create publication supabase_realtime;
	end if;
end $$;

alter publication supabase_realtime add table game_rooms;
alter publication supabase_realtime add table profiles;
alter publication supabase_realtime add table match_history;
alter publication supabase_realtime add table matchmaking_queue;
