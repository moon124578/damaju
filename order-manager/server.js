const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite 데이터베이스 파일 설정
const DB_PATH = path.join(__dirname, 'order_manager.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('SQLite 연결 실패:', err.message);
  } else {
    console.log('SQLite 데이터베이스 연결 완료');
    initializeDatabase();
  }
});

// 데이터베이스 테이블 및 실시간 통계 트리거 세팅
function initializeDatabase() {
  db.serialize(() => {
    // 1. 직원 테이블 (staffs)
    db.run(`
      CREATE TABLE IF NOT EXISTS staffs (
        staff_id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_name TEXT NOT NULL,
        commission_rate REAL DEFAULT 5.00,
        legacy_staff_id TEXT NULL
      )
    `);

    // 2. 고객 테이블 (customers)
    db.run(`
      CREATE TABLE IF NOT EXISTS customers (
        customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NULL,
        legacy_customer_id TEXT NULL,
        order_count INTEGER DEFAULT 0,
        total_quantity INTEGER DEFAULT 0,
        cancel_count INTEGER DEFAULT 0,
        total_amount INTEGER DEFAULT 0,
        last_order_date TEXT NULL
      )
    `);

    // 3. 주문 테이블 (orders)
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        total_price INTEGER NOT NULL,
        order_date TEXT NOT NULL,
        staff_id INTEGER NULL,
        order_status TEXT NOT NULL CHECK(order_status IN ('배송 전', '입금 완료', '주문 취소')),
        legacy_order_id TEXT NULL,
        FOREIGN KEY(customer_id) REFERENCES customers(customer_id),
        FOREIGN KEY(staff_id) REFERENCES staffs(staff_id)
      )
    `);

    // 4. 실시간 통계 갱신 SQLite 트리거 생성
    // INSERT 트리거
    db.run(`
      CREATE TRIGGER IF NOT EXISTS trg_orders_insert AFTER INSERT ON orders
      BEGIN
        UPDATE customers SET
          order_count = (SELECT COUNT(*) FROM orders WHERE customer_id = NEW.customer_id AND order_status != '주문 취소'),
          total_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE customer_id = NEW.customer_id AND order_status != '주문 취소'),
          cancel_count = (SELECT COUNT(*) FROM orders WHERE customer_id = NEW.customer_id AND order_status = '주문 취소'),
          total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE customer_id = NEW.customer_id AND order_status != '주문 취소'),
          last_order_date = (SELECT MAX(order_date) FROM orders WHERE customer_id = NEW.customer_id)
        WHERE customer_id = NEW.customer_id;
      END;
    `);

    // UPDATE 트리거
    db.run(`
      CREATE TRIGGER IF NOT EXISTS trg_orders_update AFTER UPDATE ON orders
      BEGIN
        UPDATE customers SET
          order_count = (SELECT COUNT(*) FROM orders WHERE customer_id = NEW.customer_id AND order_status != '주문 취소'),
          total_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE customer_id = NEW.customer_id AND order_status != '주문 취소'),
          cancel_count = (SELECT COUNT(*) FROM orders WHERE customer_id = NEW.customer_id AND order_status = '주문 취소'),
          total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE customer_id = NEW.customer_id AND order_status != '주문 취소'),
          last_order_date = (SELECT MAX(order_date) FROM orders WHERE customer_id = NEW.customer_id)
        WHERE customer_id = NEW.customer_id;
      END;
    `);

    // DELETE 트리거
    db.run(`
      CREATE TRIGGER IF NOT EXISTS trg_orders_delete AFTER DELETE ON orders
      BEGIN
        UPDATE customers SET
          order_count = (SELECT COUNT(*) FROM orders WHERE customer_id = OLD.customer_id AND order_status != '주문 취소'),
          total_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE customer_id = OLD.customer_id AND order_status != '주문 취소'),
          cancel_count = (SELECT COUNT(*) FROM orders WHERE customer_id = OLD.customer_id AND order_status = '주문 취소'),
          total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE customer_id = OLD.customer_id AND order_status != '주문 취소'),
          last_order_date = (SELECT MAX(order_date) FROM orders WHERE customer_id = OLD.customer_id)
        WHERE customer_id = OLD.customer_id;
      END;
    `);

    // 직원 더미 데이터 세팅
    db.get("SELECT COUNT(*) as count FROM staffs", (err, row) => {
      if (row && row.count === 0) {
        const stmt = db.prepare("INSERT INTO staffs (staff_name, commission_rate) VALUES (?, ?)");
        stmt.run("김철수", 5.50);
        stmt.run("이영희", 6.00);
        stmt.run("박점장", 8.00);
        stmt.finalize();
      }
    });

    // 고객 더미 데이터 세팅
    db.get("SELECT COUNT(*) as count FROM customers", (err, row) => {
      if (row && row.count === 0) {
        const stmt = db.prepare("INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)");
        stmt.run("홍길동", "010-1234-5678", "서울시 강남구 역삼동 123");
        stmt.run("성춘향", "010-9876-5432", null); // 주소지 미입력 -> 카톡요청 대상
        stmt.finalize();
      }
    });
  });
}

// ==========================================
// 백엔드 API 컨트롤러 구현
// ==========================================

// 1. 고객 리스트 조회
app.get('/api/customers', (req, res) => {
  db.all("SELECT * FROM customers ORDER BY customer_id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ customers: rows });
  });
});

// 2. 고객 주소지 수정
app.put('/api/customers/:id/address', (req, res) => {
  const customerId = req.params.id;
  const { address } = req.body;

  db.run("UPDATE customers SET address = ? WHERE customer_id = ?", [address, customerId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: '배송지 주소가 수정되었습니다.' });
  });
});

// 3. 직원 커미션 변경
app.put('/api/staffs/:id/commission', (req, res) => {
  const staffId = req.params.id;
  const { commission_rate } = req.body;

  db.run("UPDATE staffs SET commission_rate = ? WHERE staff_id = ?", [commission_rate, staffId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: '커미션 비율이 저장되었습니다.' });
  });
});

// 4. 기간별 직원 인센티브 계산 API
app.get('/api/incentives', (req, res) => {
  const { startDate, endDate } = req.query;

  const sql = `
    SELECT 
      s.staff_id, 
      s.staff_name, 
      s.commission_rate,
      COUNT(o.order_id) as order_count,
      COALESCE(SUM(o.total_price), 0) as total_sales,
      COALESCE(SUM(o.total_price), 0) * (s.commission_rate / 100.0) as calculated_incentive
    FROM staffs s
    LEFT JOIN orders o ON s.staff_id = o.staff_id 
      AND o.order_status != '주문 취소'
      AND o.order_date BETWEEN ? AND ?
    GROUP BY s.staff_id
  `;

  db.all(sql, [startDate || '2000-01-01', endDate || '2100-12-31'], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ incentives: rows });
  });
});

// 5. 실시간 라이브 채팅 파서 & 일괄 등록 API
app.post('/api/orders/parse-batch', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '파싱할 텍스트가 없습니다.' });

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const insertPromises = [];

  db.all("SELECT * FROM staffs", [], (err, staffsList) => {
    if (err) return res.status(500).json({ error: err.message });

    db.serialize(() => {
      lines.forEach((line) => {
        const tokens = line.split(/\s+/);
        if (tokens.length < 3) return;

        let customerName = '';
        let quantity = 1;
        let productName = '';
        let staffName = '';

        // 수량 파싱
        const qtyIndex = tokens.findIndex((t) => /^\d+개?$/.test(t));
        if (qtyIndex !== -1) {
          quantity = parseInt(tokens[qtyIndex].replace('개', ''), 10);
          tokens.splice(qtyIndex, 1);
        }

        // 직원 매칭
        const staffIndex = tokens.findIndex((t) => staffsList.some(s => s.staff_name === t));
        if (staffIndex !== -1) {
          staffName = tokens[staffIndex];
          tokens.splice(staffIndex, 1);
        } else {
          if (tokens.length >= 3) {
            staffName = tokens[tokens.length - 1];
            tokens.splice(tokens.length - 1, 1);
          }
        }

        // 고객 이름
        if (tokens.length > 0) {
          customerName = tokens[0];
          tokens.splice(0, 1);
        }

        // 상품명
        if (tokens.length > 0) productName = tokens.join(' ');

        // 데이터베이스 삽입 클로저
        db.get("SELECT customer_id FROM customers WHERE name = ?", [customerName], (err, row) => {
          let customerId;
          const today = new Date().toISOString().substring(0, 19).replace('T', ' ');

          const insertOrder = (cId) => {
            const staffObj = staffsList.find(s => s.staff_name === staffName) || staffsList[0];
            const staffId = staffObj ? staffObj.staff_id : null;
            const unitPrice = 30000; // 디폴트 단가

            db.run(
              "INSERT INTO orders (customer_id, product_name, quantity, unit_price, total_price, order_date, staff_id, order_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [cId, productName || '기타 상품', quantity, unitPrice, unitPrice * quantity, today, staffId, '배송 전']
            );
          };

          if (row) {
            customerId = row.customer_id;
            insertOrder(customerId);
          } else {
            // 신규 고객 생성 (연락처 공란, 주소 없음 -> 첫 구매자 식별 경고 노출 대상)
            db.run("INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)", [customerName, '010-0000-0000', null], function(err) {
              if (!err) {
                customerId = this.lastID;
                insertOrder(customerId);
              }
            });
          }
        });
      });
    });

    res.json({ success: true, message: '채팅 주문 내역이 성공적으로 파싱되어 DB에 등록되었습니다.' });
  });
});

// 6. 단일 주문 등록 API (주문 상태값 '배송 전' 강제 고정 적재)
app.post('/api/orders', (req, res) => {
  const { customer_id, product_name, quantity, unit_price, staff_id } = req.body;
  if (!customer_id || !product_name || !quantity || !unit_price) {
    return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
  }

  const today = new Date().toISOString().substring(0, 19).replace('T', ' ');
  const total_price = Number(quantity) * Number(unit_price);
  
  // 상태값 강제 고정
  const order_status = '배송 전';

  const sql = `
    INSERT INTO orders (customer_id, product_name, quantity, unit_price, total_price, order_date, staff_id, order_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [customer_id, product_name, quantity, unit_price, total_price, today, staff_id, order_status], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: '주문이 등록되었습니다. (배송 전)', order_id: this.lastID });
  });
});

// 서버 기동
app.listen(PORT, () => {
  console.log(`[CRM 백엔드 API 서버] 포트 ${PORT}에서 실행 중...`);
});
