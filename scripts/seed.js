const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function seed() {
  try {
    console.log('🌱 Starting database seed...\n');

    // Test users to create
    const testUsers = [
      { email: 'alice@example.com', password: 'password123', username: 'Alice' },
      { email: 'bob@example.com', password: 'password123', username: 'Bob' },
      { email: 'charlie@example.com', password: 'password123', username: 'Charlie' },
      { email: 'diana@example.com', password: 'password123', username: 'Diana' },
    ];

    const userIds = [];

    // Create auth users and profiles
    for (const user of testUsers) {
      console.log(`📝 Creating user: ${user.username}`);
      
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      });

      if (authError) {
        console.log(`  ⚠️  Auth user ${user.email} might exist, skipping...`);
        // Try to get existing user by email
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existing = users?.find(u => u.email === user.email);
        if (existing) {
          userIds.push(existing.id);
        }
      } else {
        userIds.push(authData.user.id);
        console.log(`  ✅ Auth user created: ${authData.user.id}`);
      }

      // Create profile
      const userId = authData?.user?.id || userIds[userIds.length - 1];
      const baseElo = 800 + Math.random() * 600; // Random ELO between 800-1400
      const wins = Math.floor(Math.random() * 50);
      const losses = Math.floor(Math.random() * 40);

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            username: user.username,
            elo_rating: Math.round(baseElo),
            wins,
            losses,
            draws: Math.floor(Math.random() * 10),
          },
          { onConflict: 'id' }
        );

      if (profileError) {
        console.log(`  ⚠️  Profile for ${user.username}: ${profileError.message}`);
      } else {
        console.log(`  ✅ Profile created for ${user.username}`);
      }
    }

    console.log(`\n✨ Seed complete!`);
    console.log(`\n📊 Test Accounts:`);
    testUsers.forEach(u => {
      console.log(`  • Email: ${u.email} | Password: ${u.password} | Username: ${u.username}`);
    });
    console.log(`\nYou can now log in at http://localhost:3000`);

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
}

seed();
