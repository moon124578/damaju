import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase 클라이언트 (메인 앱과 동일한 프로젝트)
const supabaseUrl = 'https://vrdbdtjmbitotbizknnd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyZGJkdGptYml0b3RiaXprbm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NTI1MDgsImV4cCI6MjA5NjAyODUwOH0.EVSdhqSTwuQOyJFmak-Zz-ixBkOavIJzCLTK3yYBHIU';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 미들웨어
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 고객 통계 갱신 헬퍼 (기존 SQLite 트리거 대체)
// ==========================================
async function updateCustomerStats(customerId) {
  const { data: orders } = await supabase
    .from('orders')
    .select('quantity, total_price, order_status, order_date')
    .eq('customer_id', customerId);

  const all = orders || [];
  const active = all.filter(o => o.order_status !== '주문 취소');
  const cancelled = all.filter(o => o.order_status === '주문 취소');
  const dates = all.map(o => o.order_date).filter(Boolean).sort();

  await supabase.from('customers').update({
    order_count: active.length,
    total_quantity: active.reduce((s, o) => s + (o.quantity || 0), 0),
    cancel_count: cancelled.length,
    total_amount: active.reduce((s, o) => s + (o.total_price || 0), 0),
    last_order_date: dates.length > 0 ? dates[dates.length - 1] : null
  }).eq('customer_id', customerId);
}

// ==========================================
// 백엔드 API 컨트롤러 구현
// ==========================================

// 1. 고객 리스트 조회
app.get('/api/customers', async (req, res) => {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('customer_id', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ customers: data });
});

// 2. 고객 주소지 수정
app.put('/api/customers/:id/address', async (req, res) => {
  const { address } = req.body;
  const { error } = await supabase
    .from('customers')
    .update({ address })
    .eq('customer_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, message: '배송지 주소가 수정되었습니다.' });
});

// 3. 직원 커미션 변경
app.put('/api/staffs/:id/commission', async (req, res) => {
  const { commission_rate } = req.body;
  const { error } = await supabase
    .from('staffs')
    .update({ commission_rate })
    .eq('staff_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, message: '커미션 비율이 저장되었습니다.' });
});

// 4. 기간별 직원 인센티브 계산 API
app.get('/api/incentives', async (req, res) => {
  const { startDate, endDate } = req.query;

  const { data: staffs, error: staffErr } = await supabase.from('staffs').select('*');
  if (staffErr) return res.status(500).json({ error: staffErr.message });

  let query = supabase
    .from('orders')
    .select('staff_id, total_price')
    .neq('order_status', '주문 취소');
  if (startDate) query = query.gte('order_date', startDate);
  if (endDate) query = query.lte('order_date', endDate);

  const { data: orders, error: orderErr } = await query;
  if (orderErr) return res.status(500).json({ error: orderErr.message });

  const incentives = (staffs || []).map(s => {
    const staffOrders = (orders || []).filter(o => o.staff_id === s.staff_id);
    const total_sales = staffOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
    return {
      staff_id: s.staff_id,
      staff_name: s.staff_name,
      commission_rate: s.commission_rate,
      order_count: staffOrders.length,
      total_sales,
      calculated_incentive: total_sales * ((s.commission_rate || 0) / 100)
    };
  });

  res.json({ incentives });
});

// 5. 실시간 라이브 채팅 파서 & 일괄 등록 API
app.post('/api/orders/parse-batch', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '파싱할 텍스트가 없습니다.' });

  const { data: staffsList } = await supabase.from('staffs').select('*');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const today = new Date().toISOString();
  const affectedCustomerIds = new Set();

  for (const line of lines) {
    const tokens = line.split(/\s+/);
    if (tokens.length < 3) continue;

    let customerName = '';
    let quantity = 1;
    let productName = '';
    let staffName = '';

    // 수량 파싱
    const qtyIndex = tokens.findIndex(t => /^\d+개?$/.test(t));
    if (qtyIndex !== -1) {
      quantity = parseInt(tokens[qtyIndex].replace('개', ''), 10);
      tokens.splice(qtyIndex, 1);
    }

    // 직원 매칭
    const staffIndex = tokens.findIndex(t => (staffsList || []).some(s => s.staff_name === t));
    if (staffIndex !== -1) {
      staffName = tokens[staffIndex];
      tokens.splice(staffIndex, 1);
    } else if (tokens.length >= 3) {
      staffName = tokens[tokens.length - 1];
      tokens.splice(tokens.length - 1, 1);
    }

    // 고객 이름
    if (tokens.length > 0) { customerName = tokens[0]; tokens.splice(0, 1); }
    // 상품명
    if (tokens.length > 0) productName = tokens.join(' ');

    // 고객 조회 또는 생성
    const { data: existing } = await supabase
      .from('customers')
      .select('customer_id')
      .eq('name', customerName)
      .single();

    let customerId;
    if (existing) {
      customerId = existing.customer_id;
    } else {
      const { data: created } = await supabase
        .from('customers')
        .insert({ name: customerName, phone: '010-0000-0000' })
        .select('customer_id')
        .single();
      customerId = created?.customer_id;
    }

    if (customerId) {
      const staffObj = (staffsList || []).find(s => s.staff_name === staffName) || (staffsList || [])[0];
      const unitPrice = 30000;

      await supabase.from('orders').insert({
        customer_id: customerId,
        product_name: productName || '기타 상품',
        quantity,
        unit_price: unitPrice,
        total_price: unitPrice * quantity,
        order_date: today,
        staff_id: staffObj?.staff_id || null,
        order_status: '배송 전'
      });

      affectedCustomerIds.add(customerId);
    }
  }

  // 영향받은 고객들의 통계 일괄 갱신
  for (const cid of affectedCustomerIds) {
    await updateCustomerStats(cid);
  }

  res.json({ success: true, message: '채팅 주문 내역이 성공적으로 파싱되어 DB에 등록되었습니다.' });
});

// 6. 단일 주문 등록 API (주문 상태값 '배송 전' 강제 고정 적재)
app.post('/api/orders', async (req, res) => {
  const { customer_id, product_name, quantity, unit_price, staff_id } = req.body;
  if (!customer_id || !product_name || !quantity || !unit_price) {
    return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
  }

  const today = new Date().toISOString();
  const total_price = Number(quantity) * Number(unit_price);

  const { data, error } = await supabase
    .from('orders')
    .insert({
      customer_id,
      product_name,
      quantity,
      unit_price,
      total_price,
      order_date: today,
      staff_id: staff_id || null,
      order_status: '배송 전'
    })
    .select('order_id')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await updateCustomerStats(customer_id);
  res.json({ success: true, message: '주문이 등록되었습니다. (배송 전)', order_id: data?.order_id });
});

// 서버 기동
app.listen(PORT, () => {
  console.log(`[CRM 백엔드 API 서버] 포트 ${PORT}에서 Supabase 연동 실행 중...`);
});
