const supabaseUrl = 'https://vrdbdtjmbitotbizknnd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyZGJkdGptYml0b3RiaXprbm5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NTI1MDgsImV4cCI6MjA5NjAyODUwOH0.EVSdhqSTwuQOyJFmak-Zz-ixBkOavIJzCLTK3yYBHIU';

async function run() {
  try {
    console.log('Fetching staffs...');
    const staffsRes = await fetch(`${supabaseUrl}/rest/v1/staffs?select=*`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    const staffs = await staffsRes.json();
    console.log(`Found ${staffs.length} staffs.`);

    console.log('Fetching customers...');
    const customersRes = await fetch(`${supabaseUrl}/rest/v1/customers?select=customer_id`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    const customers = await customersRes.json();
    console.log(`Found ${customers.length} customers.`);

    console.log('Fetching real products from products table...');
    const productsRes = await fetch(`${supabaseUrl}/rest/v1/products?select=name,selling_price`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    const dbProducts = await productsRes.json();
    console.log(`Found ${dbProducts.length} products in database.`);

    if (staffs.length === 0) {
      console.log('No staffs found!');
      return;
    }
    if (customers.length === 0) {
      console.log('No customers found!');
      return;
    }
    if (dbProducts.length === 0) {
      console.log('No products found in DB! Please insert products in Product Management first.');
      return;
    }

    const statuses = ['입금 완료', '배송 완료', '배송 전', '주문 취소', '환불 완료'];

    // 2026년 5월 1일 ~ 2026년 6월 6일 사이의 날짜 범위
    const startDate = new Date('2026-05-01T00:00:00').getTime();
    const endDate = new Date('2026-06-06T23:59:59').getTime();

    const dummyOrders = [];

    for (const staff of staffs) {
      console.log(`Generating 30 orders for staff: ${staff.staff_name}...`);
      for (let i = 0; i < 30; i++) {
        const randomCustomer = customers[Math.floor(Math.random() * customers.length)];
        const randomProduct = dbProducts[Math.floor(Math.random() * dbProducts.length)];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        const quantity = Math.floor(Math.random() * 4) + 1; // 1~4
        const totalPrice = randomProduct.selling_price * quantity;

        // 임의 날짜 생성
        const randomTime = new Date(startDate + Math.random() * (endDate - startDate));
        const orderDateStr = randomTime.toISOString();
        
        let refundDateStr = null;
        if (randomStatus === '환불 완료') {
          // 환불일은 주문일로부터 1~5일 뒤
          const refundTime = new Date(randomTime.getTime() + (Math.floor(Math.random() * 5) + 1) * 24 * 60 * 60 * 1000);
          // 단, 어제 날짜를 초과하지 않도록 설정
          if (refundTime.getTime() < endDate) {
            refundDateStr = refundTime.toISOString();
          } else {
            refundDateStr = new Date(endDate).toISOString();
          }
        }

        dummyOrders.push({
          customer_id: randomCustomer.customer_id,
          product_name: randomProduct.name,
          quantity: quantity,
          unit_price: randomProduct.selling_price,
          total_price: totalPrice,
          order_date: orderDateStr,
          order_status: randomStatus,
          staff_id: staff.staff_id,
          is_settled: false,
          refund_date: refundDateStr
        });
      }
    }

    console.log(`Inserting ${dummyOrders.length} dummy orders with real products into database...`);
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(dummyOrders)
    });

    if (insertRes.ok) {
      console.log('Successfully inserted all dummy orders with real products!');
    } else {
      const errText = await insertRes.text();
      console.error('Failed to insert orders:', errText);
    }
  } catch (err) {
    console.error('Error during insert:', err);
  }
}

run();
