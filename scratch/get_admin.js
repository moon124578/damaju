import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vrdbdtjmbitotbizknnd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyZGJkdGptYml0b3RiaXprbm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NTI1MDgsImV4cCI6MjA5NjAyODUwOH0.EVSdhqSTwuQOyJFmak-Zz-ixBkOavIJzCLTK3yYBHIU';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase.from('users').select('*').eq('role', 'admin');
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Admins:', data);
  }
}

run();
