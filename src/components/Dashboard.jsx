import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    todaySales: 0,
    monthNetProfit: 0,
    totalProducts: 0,
    lowStockProducts: 0,
  });
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const localDate = new Date();
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      const thisMonthStr = `${year}-${month}`;

      // 1. 금일 매출 (Today's Sales)
      const { data: todaySalesData, error: tsErr } = await supabase
        .from('sales')
        .select('quantity, selling_price')
        .eq('sale_date', todayStr);

      if (tsErr) throw tsErr;
      const todaySalesSum = (todaySalesData || []).reduce(
        (sum, item) => sum + item.quantity * item.selling_price,
        0
      );

      // 2. 당월 매출 합계 (Month's Sales)
      const { data: monthSalesData, error: msErr } = await supabase
        .from('sales')
        .select('quantity, selling_price')
        .like('sale_date', `${thisMonthStr}%`);

      if (msErr) throw msErr;
      const monthSalesSum = (monthSalesData || []).reduce(
        (sum, item) => sum + item.quantity * item.selling_price,
        0
      );

      // 3. 당월 매입 합계 (Month's Purchases)
      const { data: monthPurchasesData, error: mpErr } = await supabase
        .from('purchases')
        .select('quantity, purchase_price')
        .like('purchase_date', `${thisMonthStr}%`);

      if (mpErr) throw mpErr;
      const monthPurchasesSum = (monthPurchasesData || []).reduce(
        (sum, item) => sum + item.quantity * item.purchase_price,
        0
      );

      // 4. 당월 직원 정산 급여 합계 (Month's Payroll)
      const { data: monthPayrollData, error: mpayErr } = await supabase
        .from('payrolls')
        .select('calculated_salary')
        .like('settlement_date', `${thisMonthStr}%`);

      if (mpayErr) throw mpayErr;
      const monthPayrollSum = (monthPayrollData || []).reduce(
        (sum, item) => sum + item.calculated_salary,
        0
      );

      // 당월 순수익 = 당월 매출 - (당월 매입 + 당월 급여)
      const netProfit = monthSalesSum - (monthPurchasesSum + monthPayrollSum);

      // 5. 등록 상품 수 (Total Products)
      const { count: totalProds, error: tpErr } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      if (tpErr) throw tpErr;

      // 6. 재고 부족 상품 수 (Low Stock Count <= 10)
      const { count: lowStockProds, error: lsErr } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .lte('stock_qty', 10);

      if (lsErr) throw lsErr;

      setMetrics({
        todaySales: todaySalesSum,
        monthNetProfit: netProfit,
        totalProducts: totalProds || 0,
        lowStockProducts: lowStockProds || 0,
      });

      // 7. 최근 매출 5건 조회 (Recent Sales with Product names)
      const { data: salesList, error: listErr } = await supabase
        .from('sales')
        .select(`
          id,
          sale_date,
          quantity,
          selling_price,
          products (code, name)
        `)
        .order('id', { ascending: false })
        .limit(5);

      if (listErr) throw listErr;

      const formattedSales = (salesList || []).map((sale) => ({
        id: sale.id,
        sale_date: sale.sale_date,
        code: sale.products?.code || '-',
        name: sale.products?.name || '삭제된 상품',
        quantity: sale.quantity,
        selling_price: sale.selling_price,
        total_amount: sale.quantity * sale.selling_price,
      }));

      setRecentSales(formattedSales);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>데이터를 로딩 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="content-area">
      <div className="content-header">
        <h1 className="content-title">대시보드 요약</h1>
      </div>

      <div className="metrics-grid">
        <div className="metric-card glass-card">
          <span className="metric-title">금일 매출</span>
          <span className="metric-value mint">₩ {metrics.todaySales.toLocaleString()}</span>
        </div>
        <div className="metric-card glass-card">
          <span className="metric-title">당월 순수익</span>
          <span className={`metric-value ${metrics.monthNetProfit >= 0 ? 'mint' : 'danger'}`}>
            ₩ {metrics.monthNetProfit.toLocaleString()}
          </span>
        </div>
        <div className="metric-card glass-card">
          <span className="metric-title">등록 상품 수</span>
          <span className="metric-value">
            {metrics.totalProducts.toLocaleString()} 개
          </span>
        </div>
        <div className="metric-card glass-card">
          <span className="metric-title">재고 부족 상품 수</span>
          <span className={`metric-value ${metrics.lowStockProducts > 0 ? 'danger' : ''}`}>
            {metrics.lowStockProducts} 개
          </span>
        </div>
      </div>

      <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>
        최근 매출 내역 (최신 5개)
      </h3>

      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>판매일자</th>
              <th>상품코드</th>
              <th>상품명</th>
              <th>수량</th>
              <th>단가</th>
              <th>합계</th>
            </tr>
          </thead>
          <tbody>
            {recentSales.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  최근 판매 내역이 존재하지 않습니다.
                </td>
              </tr>
            ) : (
              recentSales.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.sale_date}</td>
                  <td>{sale.code}</td>
                  <td>{sale.name}</td>
                  <td>{sale.quantity.toLocaleString()}</td>
                  <td>₩ {sale.selling_price.toLocaleString()}</td>
                  <td style={{ fontWeight: 'bold', color: 'var(--color-mint)' }}>
                    ₩ {sale.total_amount.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
