import { createClient } from '@supabase/supabase-js';

// 1. Supabase Client Setup
const supabaseUrl = 'https://vrdbdtjmbitotbizknnd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyZGJkdGptYml0b3RiaXprbm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NTI1MDgsImV4cCI6MjA5NjAyODUwOH0.EVSdhqSTwuQOyJFmak-Zz-ixBkOavIJzCLTK3yYBHIU';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Nickname dictionary
const adjectives = [
  '행복한', '신나는', '동글동글한', '빛나는', '똑똑한', '귀여운', '멋진', '스마트한', 
  '사랑스러운', '재빠른', '느긋한', '용감한', '상냥한', '활기찬', '든든한', '포근한', 
  '신비로운', '명랑한', '얌전한', '친절한', '따뜻한', '상큼한', '달콤한', '씩씩한',
  '듬직한', '영리한', '단단한', '유연한', '조용한', '빛고운', '하늘색', '은빛',
  '날쌘', '부지런한', '착한', '재기발랄한', '유쾌한', '순한', '발랄한'
];

const nouns = [
  '호랑이', '사자', '토끼', '고양이', '강아지', '판다', '펭귄', '여우', 
  '늑대', '곰', '사슴', '코알라', '독수리', '돌고래', '올빼미', '다람쥐', '코끼리', 
  '기린', '얼룩말', '앵무새', '햄스터', '미어캣', '나무늘보', '고슴도치',
  '바다표범', '수달', '해마', '거북이', '루돌프', '유니콘', '돌고래', '고래',
  '병아리', '오리', '강아지', '야옹이', '사막여우', '쿼카'
];

const usedNicknames = new Set();

function generateNickname() {
  let attempt = 0;
  while (attempt < 1000) {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const nick = `${adj}${noun}`;
    if (!usedNicknames.has(nick)) {
      usedNicknames.add(nick);
      return nick;
    }
    attempt++;
  }
  // Fallback
  return `행복한고객${Math.floor(Math.random() * 10000)}`;
}

async function run() {
  console.log('--- Starting Supabase Nickname Seeding ---');

  try {
    const { data: custData, error: fetchErr } = await supabase
      .from('customers')
      .select('customer_id, name, nickname');

    if (fetchErr) throw fetchErr;

    console.log(`Fetched ${custData.length} customers from Supabase.`);

    let updatedCount = 0;
    for (const customer of custData) {
      // If customer doesn't have a nickname, or has a default/empty/dummy one
      if (!customer.nickname || customer.nickname.trim() === '' || customer.nickname.startsWith('nickname') || customer.nickname === customer.name) {
        const newNick = generateNickname();
        const { error: updateErr } = await supabase
          .from('customers')
          .update({ nickname: newNick })
          .eq('customer_id', customer.customer_id);

        if (updateErr) {
          console.error(`Failed to update customer ${customer.customer_id}:`, updateErr.message);
        } else {
          console.log(`Supabase: Updated ${customer.name} (ID: ${customer.customer_id}) -> ${newNick}`);
          updatedCount++;
        }
      } else {
        // Track already valid nicknames to keep them unique
        usedNicknames.add(customer.nickname);
      }
    }
    console.log(`Supabase nickname update complete. Updated ${updatedCount} customers.`);
  } catch (err) {
    console.error('Error during Supabase updates:', err);
  }
}

run();
