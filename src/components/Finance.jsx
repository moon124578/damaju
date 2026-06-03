import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Finance() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ledger, setLedger] = useState([]);
  const [summary, setSummary] = useState({
    salesTotal: 0,
    purchaseTotal: 0,
    netProfit: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 기본값: 이번 달 1일부터 오늘까지
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    setStartDate(`${year}-${month}-01`);
    setEndDate(`${year}-${month}-${day}`);
    
    fetchFinancialData(`${year}-${month}-01`, `${year}-${month}-${day}`);
  }, []);

  const fetchFinancialData = async (start = startDate, end = endDate) => {
    if (!start || !end) {
      alert('시작일과 종료일을 입력해주세요.');
      return;
    }
    setLoading(true);

    try {
      // 1. 매출 내역 조회 (Sales)
      const { data: sales, error: salesErr } = await supabase
        .from('sales')
        .select(`
          sale_date,
          quantity,
          selling_price,
          products (name)
        `)
        .between('sale_date', start, end);

      if (salesErr) throw salesErr;

      const salesList = (sales || []).map((s) => ({
        date: s.sale_date,
        type: '매출',
        detail: `${s.products?.name || '삭제된 상품'} ${s.quantity}개 판매`,
        amount: s.quantity * s.selling_price,
      }));

      // 2. 매입 내역 조회 (Purchases)
      const { data: purchases, error: purErr } = await supabase
        .from('purchases')
        .select(`
          purchase_date,
          quantity,
          purchase_price,
          products (name)
        `)
        .between('purchase_date', start, end);

      if (purErr) throw purErr;

      const purchaseList = (purchases || []).map((p) => ({
        date: p.purchase_date,
        type: '매입',
        detail: `${p.products?.name || '삭제된 상품'} ${p.quantity}개 입고`,
        amount: -(p.quantity * p.purchase_price),
      }));

      // 3. 인건비 정산 내역 조회 (Payrolls)
      const { data: payrolls, error: payErr } = await supabase
        .from('payrolls')
        .select(`
          settlement_date,
          settlement_month,
          calculated_salary,
          employees (name)
        `)
        .between('settlement_date', start, end);

      if (payErr) throw payErr;

      const payrollList = (payrolls || []).map((pa) => ({
        date: pa.settlement_date,
        type: '인건비',
        detail: `${pa.employees?.name || '퇴사한 직원'} (${pa.settlement_month}) 급여 정산`,
        amount: -pa.calculated_salary,
      }));

      // 4. 통합 원장(Ledger) 구성 및 날짜 역순 정렬
      const unifiedLedger = [...salesList, ...purchaseList, ...payrollList];
      unifiedLedger.sort((a, b) => new Date(b.date) - new Date(a.date));
      setLedger(unifiedLedger);

      // 5. 합계 계산
      let salesSum = 0;
      let purchaseSum = 0; // 지출 (매입 + 급여)

      unifiedLedger.forEach((item) => {
        if (item.amount > 0) {
          salesSum += item.amount;
        } else {
          purchaseSum += Math.abs(item.amount);
        }
      });

      setSummary({
        salesTotal: salesSum,
        purchaseTotal: purchaseSum,
        netProfit: salesSum - purchaseSum,
      });
    } catch (err) {
      console.error(err);
      alert('재무 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchFinancialData();
  };

  // CSV 내보내기 기능 실제 구현
  const handleExportCSV = () => {
    if (ledger.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    // CSV 파일 헤더 정의
    const headers = ['거래일자', '구분', '상세내역', '거래금액(원)'];
    const rows = ledger.map((item) => [
      item.date,
      item.type,
      item.detail,
      item.amount,
    ]);

    // CSV 문자열 조립
    const csvContent =
      headers.join(',') +
      '\n' +
      rows.map((row) => row.map((val) => `"${val}"`).join(',')).join('\n');

    // Excel 한글 깨짐을 방지하기 위해 BOM(\uFEFF) 문자 추가
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `매장정산원장_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="content-area">
      <div className="content-header">
        <h1 className="content-title">매출 매입 및 순수익 통계</h1>
      </div>

      <div className="search-bar" style={{ alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>시작일:</span>
        <input
          type="date"
          className="input-control"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{ width: '150px' }}
        />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>종료일:</span>
        <input
          type="date"
          className="input-control"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={{ width: '150px' }}
        />
        <button className="btn btn-secondary" onClick={handleSearch}>
          조회
        </button>
        <button className="btn btn-primary" onClick={handleExportCSV}>
          CSV 다운로드
        </button>
      </div>

      <div className="metrics-grid">
        <div className="metric-card glass-card">
          <span className="metric-title">기간 매출 합계</span>
          <span className="metric-value mint">₩ {summary.salesTotal.toLocaleString()}</span>
        </div>
        <div className="metric-card glass-card">
          <span className="metric-title">기간 매입 합계 (인건비 포함)</span>
          <span className="metric-value">₩ {summary.purchaseTotal.toLocaleString()}</span>
        </div>
        <div className="metric-card glass-card">
          <span className="metric-title">최종 순수익</span>
          <span className={`metric-value ${summary.netProfit >= 0 ? 'mint' : 'danger'}`}>
            ₩ {summary.netProfit.toLocaleString()}
          </span>
        </div>
      </div>

      <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>
        상세 거래 원장
      </h3>

      <div className="table-container">
        {loading ? (
          <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>로딩 중...</p>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>거래일자</th>
                <th>구분</th>
                <th>적요/상세내역</th>
                <th style={{ textAlign: 'right' }}>거래금액</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                    해당 기간에 발생한 거래 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                ledger.map((item, idx) => {
                  const isPositive = item.amount > 0;
                  return (
                    <tr key={idx}>
                      <td>{item.date}</td>
                      <td>
                        <span
                          className={`status-tag ${
                            item.type === '매출' ? 'settled' : item.type === '매입' ? 'unsettled' : ''
                          }`}
                          style={{
                            backgroundColor:
                              item.type === '인건비' ? 'rgba(0, 180, 216, 0.15)' : '',
                            color: item.type === '인건비' ? 'var(--color-blue)' : '',
                          }}
                        >
                          {item.type}
                        </span>
                      </td>
                      <td>{item.detail}</td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 'bold',
                          color: isPositive ? 'var(--color-mint)' : 'var(--color-danger)',
                        }}
                      >
                        {isPositive ? '+' : '-'} ₩ {Math.abs(item.amount).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
