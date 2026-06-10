import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Employees({ onDataChange }) {
  const [staffs, setStaffs] = useState([]);
  const [loading, setLoading] = useState(true);

  // 정산서 문구 상태
  const [invoiceMessage, setInvoiceMessage] = useState('예쁜 거, 다 담아드릴게요. 이용해 주셔서 감사합니다! ❤️');

  // 정산 유형: '주정산' (7일), '2주정산' (14일), '월정산' (당월 1일~말일)
  const [settlementType, setSettlementType] = useState('주정산');
  const [selectedStaffId, setSelectedStaffId] = useState('all');

  // 날짜 범위
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 실적 현황
  const [unsettledData, setUnsettledData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [activeTab, setActiveTab] = useState('new'); // 'new' (신규 정산), 'history' (과거 정산 내역)

  // 직원 추가/수정 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [formData, setFormData] = useState({
    staff_name: '',
    commission_rate: 5.0,
    settlement_cycle: '주정산',
  });

  // 직원별 이전 정산 내역 모달 상태
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyModalStaff, setHistoryModalStaff] = useState(null);

  const openHistoryModal = (staff) => {
    setHistoryModalStaff(staff);
    setIsHistoryModalOpen(true);
  };

  const closeHistoryModal = () => {
    setHistoryModalStaff(null);
    setIsHistoryModalOpen(false);
  };

  // 직원 정산서 모달 상태
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [statementModalData, setStatementModalData] = useState(null);

  const openStatementModal = (row) => {
    setStatementModalData(row);
    setIsStatementModalOpen(true);
  };

  const closeStatementModal = () => {
    setStatementModalData(null);
    setIsStatementModalOpen(false);
  };

  // 정산서 텍스트 카톡용 클립보드 복사
  const handleCopyTextStatement = (row) => {
    if (!row) return;
    const tax = Math.round(row.incentiveAmount * 0.033);
    const netPay = row.incentiveAmount - tax;
    const text = `[정산 명세서] ${row.staff_name} 님 (${row.settlement_cycle})
정산 범위: ${startDate} ~ ${endDate}

■ ① 판매 실적
   - 수량: ${row.salesCount}개
   - 금액: ₩${row.salesAmount.toLocaleString()}
   - 판매 수수료 (+): ₩${row.salesCommission.toLocaleString()} (${row.commission_rate}%)

■ ② 환불 실적
   - 수량: ${row.refundCount}개
   - 금액: ₩${row.refundAmount.toLocaleString()}
   - 환불 수수료 차감 (-): ₩${row.refundCommission.toLocaleString()} (${row.commission_rate}%)

━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 세전 수수료 합계: ₩${row.incentiveAmount.toLocaleString()}
■ 3.3% 원천징수 세액 (-): ₩${tax.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━━━━━━━
★ 실제 세후 실수령액: ₩${netPay.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━
${invoiceMessage}`;

    navigator.clipboard.writeText(text)
      .then(() => {
        alert('정산서 텍스트가 클립보드에 복사되었습니다! 카카오톡 창에 붙여넣기(Ctrl+V) 하세요.');
      })
      .catch(err => {
        console.error(err);
        alert('클립보드 복사에 실패했습니다.');
      });
  };

  // 초기 로드 시 날짜 제안 (어제 기준 최근 7일)
  useEffect(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const past = new Date();
    past.setDate(yesterday.getDate() - 6);

    setStartDate(past.toISOString().substring(0, 10));
    setEndDate(yesterday.toISOString().substring(0, 10));

    fetchData();
    fetchSettings();

    const updateStyle = () => { fetchSettings(); };
    window.addEventListener('invoice_style_changed', updateStyle);
    return () => window.removeEventListener('invoice_style_changed', updateStyle);
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'invoice_message');
      if (error) throw error;
      if (data && data.length > 0) {
        setInvoiceMessage(data[0].value);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. 직원 목록 가져오기
      const { data: staffData } = await supabase
        .from('staffs')
        .select('*')
        .order('staff_id', { ascending: true });
      setStaffs(staffData || []);

      // 2. 과거 정산 목록 가져오기
      const { data: histData } = await supabase
        .from('staff_settlements')
        .select('*, staffs(staff_name)')
        .order('settled_at', { ascending: false });
      setHistoryData(histData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 날짜 범위나 필터 변경 시 미정산 데이터 조회 및 연산
  useEffect(() => {
    if (startDate && endDate) {
      loadUnsettledPerformance();
    }
  }, [startDate, endDate, selectedStaffId, staffs]);

  const loadUnsettledPerformance = async () => {
    try {
      const startIso = `${startDate}T00:00:00Z`;
      const endIso = `${endDate}T23:59:59Z`;

      // 1. 기간 내의 주문들 중 미정산(is_settled: false) 건 조회
      // 판매대상 주문 상태: '입금 완료', '배송 완료'
      const { data: salesData } = await supabase
        .from('orders')
        .select('order_id, total_price, quantity, order_date, staff_id')
        .eq('is_settled', false)
        .in('order_status', ['입금 완료', '배송 완료'])
        .gte('order_date', startIso)
        .lte('order_date', endIso);

      // 2. 환불건 조회
      // '환불 완료' 상태인 주문들 조회
      // 이월 정책:
      // - 이번 정산 기간 내에 환불 처리(refund_date가 start~end 사이)된 환불완료건 중, 아직 환불 정산이 안 된(refund_settlement_id IS NULL) 건
      // - 만약 이전 정산 기간에 발행/입금된 건이더라도 이번 기간 내에 환불 처리가 되었다면 이번 정산에 환불금으로 차감 연산함.
      const { data: refundsData } = await supabase
        .from('orders')
        .select('order_id, total_price, quantity, refund_date, staff_id')
        .eq('order_status', '환불 완료')
        .is('refund_settlement_id', null)
        .gte('refund_date', startIso)
        .lte('refund_date', endIso);

      // 직원별 집계
      const calculated = staffs
        .filter(s => selectedStaffId === 'all' || s.staff_id.toString() === selectedStaffId)
        .map(staff => {
          // 판매 집계
          const staffSales = (salesData || []).filter(o => o.staff_id === staff.staff_id);
          const salesCount = staffSales.reduce((sum, o) => sum + o.quantity, 0);
          const salesAmount = staffSales.reduce((sum, o) => sum + o.total_price, 0);

          // 환불 집계
          const staffRefunds = (refundsData || []).filter(o => o.staff_id === staff.staff_id);
          const refundCount = staffRefunds.reduce((sum, o) => sum + o.quantity, 0);
          const refundAmount = staffRefunds.reduce((sum, o) => sum + o.total_price, 0);

          // 순매출액 계산 (판매금액 - 환불금액)
          const netSalesAmount = Math.max(0, salesAmount - refundAmount);

          // 지급 예정 인센티브액 계산
          const rate = parseFloat(staff.commission_rate) / 100;
          const salesCommission = Math.round(salesAmount * rate);
          const refundCommission = Math.round(refundAmount * rate);
          const incentiveAmount = Math.max(0, salesCommission - refundCommission);

          // 다음 정산 예정일 및 알림 여부 계산
          const latestSettle = (historyData || []).find(h => h.staff_id === staff.staff_id);
          let baseDate = null;
          let hasSettleHistory = false;

          if (latestSettle && latestSettle.end_date) {
            baseDate = new Date(latestSettle.end_date);
            hasSettleHistory = true;
          } else {
            // 정산 이력이 없으면 미정산 주문(판매 또는 환불) 중 가장 빠른 날짜를 기준일로 삼음
            const allOrders = [...staffSales, ...staffRefunds];
            if (allOrders.length > 0) {
              const dates = allOrders.map(o => new Date(o.order_date || o.refund_date).getTime());
              baseDate = new Date(Math.min(...dates));
            }
          }

          let nextSettleDate = null;
          let isUrgent = false;
          let dDayText = '';

          if (baseDate) {
            nextSettleDate = new Date(baseDate);
            const cycle = staff.settlement_cycle || '주정산';
            if (cycle === '주정산') {
              nextSettleDate.setDate(nextSettleDate.getDate() + 7);
            } else if (cycle === '2주정산') {
              nextSettleDate.setDate(nextSettleDate.getDate() + 14);
            } else if (cycle === '월정산') {
              nextSettleDate.setMonth(nextSettleDate.getMonth() + 1);
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const target = new Date(nextSettleDate);
            target.setHours(0, 0, 0, 0);
            
            const diffTime = target.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 2) {
              isUrgent = true;
            }

            if (diffDays === 0) {
              dDayText = 'D-Day';
            } else if (diffDays > 0) {
              dDayText = `D-${diffDays}`;
            } else {
              dDayText = `예정일 경과 (D+${Math.abs(diffDays)})`;
            }
          }

          return {
            staff_id: staff.staff_id,
            staff_name: staff.staff_name,
            commission_rate: staff.commission_rate,
            settlement_cycle: staff.settlement_cycle || '주정산',
            salesCount,
            salesAmount,
            salesCommission,
            refundCount,
            refundAmount,
            refundCommission,
            incentiveAmount,
            nextSettleDate: nextSettleDate ? nextSettleDate.toISOString().substring(0, 10) : null,
            isUrgent,
            dDayText,
            sale_order_ids: staffSales.map(o => o.order_id),
            refund_order_ids: staffRefunds.map(o => o.order_id)
          };
        });

      setUnsettledData(calculated);
    } catch (err) {
      console.error('실적 집계 에러:', err);
    }
  };

  // 정산 실행
  const handlePerformSettlement = async (staffPerformance) => {
    const { staff_id, staff_name, settlement_cycle, salesCount, salesAmount, refundCount, refundAmount, incentiveAmount, sale_order_ids, refund_order_ids } = staffPerformance;
    
    // 당일 포함 차단 로직
    const todayStr = new Date().toISOString().substring(0, 10);
    if (endDate >= todayStr) {
      alert('당일(오늘)을 포함한 실적은 정산할 수 없습니다. 최대 전날까지만 정산이 가능하므로 종료일을 어제 이전으로 설정해 주세요.');
      return;
    }

    if (salesCount === 0 && refundCount === 0) {
      alert(`${staff_name} 직원의 정산할 매출 또는 환불 내역이 없습니다.`);
      return;
    }

    if (!window.confirm(`${staff_name} 직원의 [${settlement_cycle}] 정산(지급 인센티브: ₩${incentiveAmount.toLocaleString()})을 완료하시겠습니까?`)) return;

    setLoading(true);
    try {
      // 1. staff_settlements에 내역 기록
      const { data: settleRow, error: settleErr } = await supabase
        .from('staff_settlements')
        .insert({
          staff_id,
          settlement_type: settlement_cycle,
          start_date: `${startDate}T00:00:00Z`,
          end_date: `${endDate}T23:59:59Z`,
          sales_count: salesCount,
          sales_amount: salesAmount,
          refund_count: refundCount,
          refund_amount: refundAmount,
          incentive_amount: incentiveAmount
        })
        .select()
        .single();

      if (settleErr) throw settleErr;

      const newSettlementId = settleRow.settlement_id;

      // 2. 판매건 마킹 (is_settled: true, settlement_id 대입)
      if (sale_order_ids.length > 0) {
        const { error: saleUpErr } = await supabase
          .from('orders')
          .update({
            is_settled: true,
            settlement_id: newSettlementId
          })
          .in('order_id', sale_order_ids);
        if (saleUpErr) throw saleUpErr;
      }

      // 3. 환불건 마킹 (refund_settlement_id 대입)
      if (refund_order_ids.length > 0) {
        const { error: refundUpErr } = await supabase
          .from('orders')
          .update({
            refund_settlement_id: newSettlementId
          })
          .in('order_id', refund_order_ids);
        if (refundUpErr) throw refundUpErr;
      }

      alert(`${staff_name} 직원의 정산 처리가 성공적으로 완료되었습니다.`);
      await fetchData();
      await loadUnsettledPerformance();
      if (onDataChange) onDataChange();
    } catch (err) {
      console.error(err);
      alert('정산 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 과거 정산 내역 삭제 (취소)
  const handleDeleteSettlement = async (settlementId) => {
    if (!window.confirm('해당 정산 이력을 삭제하시겠습니까? 관련 주문들은 다시 미정산 상태로 롤백됩니다.')) return;
    setLoading(true);
    try {
      // 1. 해당 정산에 속한 판매 주문들의 정산 필드 초기화
      const { error: saleUpErr } = await supabase
        .from('orders')
        .update({
          is_settled: false,
          settlement_id: null
        })
        .eq('settlement_id', settlementId);
      if (saleUpErr) throw saleUpErr;

      // 2. 해당 정산에 속한 환불 주문들의 정산 필드 초기화
      const { error: refundUpErr } = await supabase
        .from('orders')
        .update({
          refund_settlement_id: null
        })
        .eq('refund_settlement_id', settlementId);
      if (refundUpErr) throw refundUpErr;

      // 3. 정산 마스터 로우 삭제
      const { error: delErr } = await supabase
        .from('staff_settlements')
        .delete()
        .eq('settlement_id', settlementId);
      if (delErr) throw delErr;

      alert('정산 이력이 취소되었습니다.');
      await fetchData();
      await loadUnsettledPerformance();
      if (onDataChange) onDataChange();
    } catch (err) {
      console.error(err);
      alert('정산 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setSelectedStaff(null);
    setFormData({ staff_name: '', commission_rate: 5.0, settlement_cycle: '주정산' });
    setIsModalOpen(true);
  };

  const openEditModal = (staff) => {
    setSelectedStaff(staff);
    setFormData({
      staff_name: staff.staff_name,
      commission_rate: parseFloat(staff.commission_rate),
      settlement_cycle: staff.settlement_cycle || '주정산'
    });
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.staff_name.trim()) {
      alert('직원명은 필수 항목입니다.');
      return;
    }

    try {
      if (selectedStaff) {
        const { error } = await supabase
          .from('staffs')
          .update({
            staff_name: formData.staff_name.trim(),
            commission_rate: parseFloat(formData.commission_rate),
            settlement_cycle: formData.settlement_cycle
          })
          .eq('staff_id', selectedStaff.staff_id);
        if (error) throw error;
        alert('직원 정보가 수정되었습니다.');
      } else {
        const { error } = await supabase
          .from('staffs')
          .insert({
            staff_name: formData.staff_name.trim(),
            commission_rate: parseFloat(formData.commission_rate),
            settlement_cycle: formData.settlement_cycle
          });
        if (error) throw error;
        alert('직원이 등록되었습니다.');
      }

      setIsModalOpen(false);
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteStaff = async (staffId, name) => {
    if (!window.confirm(`직원 '${name}'을(를) 정말 삭제하시겠습니까?`)) return;

    try {
      const { error } = await supabase
        .from('staffs')
        .delete()
        .eq('staff_id', staffId);
      if (error) throw error;

      alert('직원이 삭제되었습니다.');
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="content-area" style={{ fontFamily: "'Hanken Grotesk', 'Malgun Gothic', sans-serif" }}>
      <div className="content-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 className="content-title" style={{ fontSize: '24px', fontWeight: 600 }}>직원 정산 관리</h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            직원별 고정 수수료율을 관리하고 주/2주/월 단위로 미정산된 판매 및 환불 내역을 집계하여 정산합니다. (정산 완료 이후의 환불건은 이월 자동 차감)
          </p>
        </div>
      </div>

      {/* 상단 탭 제어 */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveTab('new')}
          style={{
            padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: activeTab === 'new' ? '#006688' : 'transparent',
            color: activeTab === 'new' ? '#ffffff' : 'var(--text-primary)',
            fontWeight: 600, fontSize: '13.5px'
          }}
        >
          💰 신규 실적 정산하기
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: activeTab === 'history' ? '#006688' : 'transparent',
            color: activeTab === 'history' ? '#ffffff' : 'var(--text-primary)',
            fontWeight: 600, fontSize: '13.5px'
          }}
        >
          📅 과거 정산 데이터 확인
        </button>
      </div>

      {activeTab === 'new' ? (
        <div className="splitter-container" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          
          {/* 좌측: 직원 커미션 관리 */}
          <div className="splitter-left glass-card" style={{ padding: '20px', flex: 1.2, minWidth: '320px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>직원 목록 및 수수료율</h3>
              <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={openAddModal}>
                ➕ 직원 추가
              </button>
            </div>

            <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {loading && staffs.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>로딩 중...</p>
              ) : (
                <table className="custom-table" style={{ fontSize: '12.5px', width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', background: 'rgba(0,0,0,0.02)' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>이름</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>수수료율</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>정산 주기</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffs.map((s) => (
                      <tr key={s.staff_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px', fontWeight: '600' }}>{s.staff_name}</td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: 'var(--color-mint-hover)' }}>
                          {s.commission_rate} %
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: '600', color: '#006688' }}>
                          {s.settlement_cycle || '주정산'}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '2px 6px', fontSize: '11px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}
                              onClick={() => openHistoryModal(s)}
                            >
                              이전 정산
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '2px 6px', fontSize: '11px' }}
                              onClick={() => openEditModal(s)}
                            >
                              수정
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '2px 6px', fontSize: '11px' }}
                              onClick={() => handleDeleteStaff(s.staff_id, s.staff_name)}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 우측: 정산 실적 산출 및 정산 액션 */}
          <div className="splitter-right glass-card" style={{ padding: '20px', flex: 2, minWidth: '450px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '16px', margin: 0 }}>
              💵 정산 범위 필터 및 미정산 실적 집계
            </h3>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1.2, minWidth: '140px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>시작일</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().substring(0, 10)}
                  style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1.2, minWidth: '140px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>종료일 (최대 전날까지)</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  max={new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().substring(0, 10)}
                  style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '110px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>대상 직원</label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', background: '#ffffff', outline: 'none' }}
                >
                  <option value="all">전체 직원</option>
                  {staffs.map(s => (
                    <option key={s.staff_id} value={s.staff_id.toString()}>{s.staff_name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 미정산 실적 분석 리스트 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {unsettledData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
                  해당 기간 내 미정산 주문 실적이 없습니다.
                </div>
              ) : (
                unsettledData.map((row) => (
                  <div
                    key={row.staff_id}
                    style={{
                      border: row.isUrgent ? '2.5px solid #f97316' : '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '16px',
                      background: row.isUrgent ? '#fffaf8' : 'rgba(255, 255, 255, 0.5)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          👤 {row.staff_name} ({row.settlement_cycle}, 커미션 {row.commission_rate}%)
                        </span>
                        {row.nextSettleDate && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 'bold',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: row.isUrgent ? '#ffedd5' : '#f1f5f9',
                            color: row.isUrgent ? '#ea580c' : '#475569',
                            border: row.isUrgent ? '1px solid #fed7aa' : '1px solid #cbd5e1'
                          }}>
                            차기정산: {row.nextSettleDate} ({row.dDayText})
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => openStatementModal(row)}
                          style={{
                            padding: '6px 12px', background: '#ffffff', color: '#006688', border: '1px solid #cbd5e1',
                            borderRadius: '6px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>receipt_long</span>
                          정산서
                        </button>
                        <button
                          onClick={() => handlePerformSettlement(row)}
                          disabled={row.salesCount === 0 && row.refundCount === 0}
                          style={{
                            padding: '6px 16px', background: '#006688', color: '#ffffff', border: 'none',
                            borderRadius: '6px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          정산 완료하기
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                      {/* 1. 판매 실적 */}
                      <div style={{ padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>① 판매 실적</span>
                        <span style={{ marginTop: '6px', fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                          {row.salesCount}개 / ₩{row.salesAmount.toLocaleString()}
                        </span>
                      </div>

                      {/* 2. 판매 수수료 (+) */}
                      <div style={{ padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>② 판매 수수료 (+)</span>
                        <span style={{ marginTop: '6px', fontWeight: 800, fontSize: '13px', color: '#16a34a' }}>
                          ₩{row.salesCommission.toLocaleString()}
                        </span>
                        <span style={{ fontSize: '9.5px', color: '#15803d', marginTop: '2px' }}>
                          (판매액의 {row.commission_rate}%)
                        </span>
                      </div>

                      {/* 3. 환불 금액 */}
                      <div style={{ padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>③ 환불 금액</span>
                        <span style={{ marginTop: '6px', fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                          {row.refundCount}개 / ₩{row.refundAmount.toLocaleString()}
                        </span>
                      </div>

                      {/* 4. 환불 수수료 차감 (-) */}
                      <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>④ 환불 수수료 차감 (-)</span>
                        <span style={{ marginTop: '6px', fontWeight: 800, fontSize: '13px', color: '#dc2626' }}>
                          -₩{row.refundCommission.toLocaleString()}
                        </span>
                        <span style={{ fontSize: '9.5px', color: '#b91c1c', marginTop: '2px' }}>
                          (환불액의 {row.commission_rate}%)
                        </span>
                      </div>

                      {/* 5. 최종 지급액 (=) */}
                      <div style={{ padding: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: 600 }}>⑤ 최종 지급액 (=)</span>
                        <span style={{ marginTop: '6px', fontWeight: 800, fontSize: '13.5px', color: '#0284c7' }}>
                          ₩{row.incentiveAmount.toLocaleString()}
                        </span>
                        <span style={{ fontSize: '9.5px', color: '#0369a1', marginTop: '2px' }}>
                          (② 판매수수료 - ④ 환불수수료)
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* 과거 정산 이력 보기 탭 */
        <div className="glass-card" style={{ padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '16px', margin: 0 }}>
            📚 완료된 과거 직원 정산 내역 조회
          </h3>

          <div className="table-container" style={{ overflowX: 'auto', marginTop: '16px' }}>
            {historyData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>완료된 정산 이력이 존재하지 않습니다.</div>
            ) : (
              <table className="custom-table" style={{ width: '100%', fontSize: '12.5px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', background: 'rgba(0,0,0,0.02)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>정산일시</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>직원명</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>주기</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>정산 기간</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>판매(건수/금액)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#ba1a1a' }}>환불(건수/금액)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a' }}>지급 인센티브</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.map((hist) => (
                    <tr key={hist.settlement_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace' }}>
                        {new Date(hist.settled_at).toLocaleString('ko-KR')}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                        {hist.staffs?.staff_name || '알 수 없음'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', padding: '2px 6px', background: '#f0f3ff', color: '#006688', borderRadius: '4px', fontWeight: 600 }}>
                          {hist.settlement_type}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                        {hist.start_date.substring(5,10)} ~ {hist.end_date.substring(5,10)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {hist.sales_count}개 / ₩{parseFloat(hist.sales_amount).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ba1a1a' }}>
                        {hist.refund_count}개 / ₩{parseFloat(hist.refund_amount).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                        ₩{parseFloat(hist.incentive_amount).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteSettlement(hist.settlement_id)}
                          style={{
                            padding: '3px 8px', background: '#ffe0e0', color: '#ba1a1a', border: '1px solid #ffb4ab',
                            borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                          }}
                        >
                          정산 취소
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 직원 추가/수정 모달 */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleModalClose}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '340px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {selectedStaff ? '직원 커미션 비율 수정' : '신규 직원 추가'}
              </h3>
              <button
                onClick={handleModalClose}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label>직원명 *</label>
                  <input
                    type="text"
                    className="input-control"
                    value={formData.staff_name}
                    onChange={(e) => setFormData({ ...formData, staff_name: e.target.value })}
                    required
                    disabled={!!selectedStaff}
                  />
                </div>
                <div className="form-group">
                  <label>인센티브 수수료 비율 (%) *</label>
                  <input
                    type="number"
                    className="input-control"
                    value={formData.commission_rate}
                    onChange={(e) => setFormData({ ...formData, commission_rate: e.target.value })}
                    step="0.01"
                    min="0"
                    max="100"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>정산 주기 *</label>
                  <select
                    className="input-control"
                    value={formData.settlement_cycle}
                    onChange={(e) => setFormData({ ...formData, settlement_cycle: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', background: '#ffffff', outline: 'none' }}
                    required
                  >
                    <option value="주정산">주정산 (7일)</option>
                    <option value="2주정산">2주정산 (14일)</option>
                    <option value="월정산">월정산 (한달)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleModalClose}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 직원별 이전 정산 내역 모달 */}
      {isHistoryModalOpen && historyModalStaff && (
        <div className="modal-overlay" onClick={closeHistoryModal} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '920px', maxWidth: '95vw', background: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                👤 {historyModalStaff.staff_name} 직원의 이전 정산 내역 (커미션 {historyModalStaff.commission_rate}%)
              </h3>
              <button
                onClick={closeHistoryModal}
                style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '24px', cursor: 'pointer', fontWeight: 600 }}
              >
                &times;
              </button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '450px', overflowY: 'auto' }}>
              {historyData.filter(h => h.staff_id === historyModalStaff.staff_id).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '13.5px' }}>
                  이전 정산 완료 이력이 존재하지 않습니다.
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                      <th style={{ padding: '10px 12px' }}>정산일시</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>주기</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>정산 범위</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>판매 실적</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a' }}>판매 수수료</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>환불 실적</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>환불 수수료 차감</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', color: '#0284c7', fontWeight: 800 }}>최종 지급액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData
                      .filter(h => h.staff_id === historyModalStaff.staff_id)
                      .map((hist) => {
                        const rate = parseFloat(historyModalStaff.commission_rate) / 100;
                        const salesCommission = Math.round(parseFloat(hist.sales_amount) * rate);
                        const refundCommission = Math.round(parseFloat(hist.refund_amount) * rate);

                        return (
                          <tr key={hist.settlement_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#475569' }}>
                              {new Date(hist.settled_at).toLocaleString('ko-KR')}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{ fontSize: '11px', padding: '2px 6px', background: '#f0f4f8', color: '#006688', borderRadius: '4px', fontWeight: 600 }}>
                                {hist.settlement_type}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '11px', color: '#64748b' }}>
                              {hist.start_date.substring(0, 10)} ~ {hist.end_date.substring(0, 10)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                              {hist.sales_count}개 / ₩{parseFloat(hist.sales_amount).toLocaleString()}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                              ₩{salesCommission.toLocaleString()}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                              {hist.refund_count}개 / ₩{parseFloat(hist.refund_amount).toLocaleString()}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                              -₩{refundCommission.toLocaleString()}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0284c7', fontSize: '12.5px' }}>
                              ₩{parseFloat(hist.incentive_amount).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
              <button
                onClick={closeHistoryModal}
                style={{ padding: '8px 16px', background: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 직원 정산 명세서 (프린트 및 카톡 복사 모달) */}
      {isStatementModalOpen && statementModalData && (
        <div className="modal-overlay" onClick={closeStatementModal} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.6)', zIndex: 1000 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '480px', maxWidth: '95vw', background: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* 출력 전용 스타일 */}
            <style>{`
              @media print {
                body * {
                  visibility: hidden;
                }
                #statement-print-area, #statement-print-area * {
                  visibility: visible;
                }
                #statement-print-area {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100%;
                  margin: 0;
                  padding: 24px;
                  box-shadow: none !important;
                  border: none !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>

            <div className="modal-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                📄 {statementModalData.staff_name} 정산 명세서 발행
              </h3>
              <button
                onClick={closeStatementModal}
                style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '24px', cursor: 'pointer', fontWeight: 600 }}
              >
                &times;
              </button>
            </div>

            {/* 영수증 스타일의 인쇄 영역 */}
            <div id="statement-print-area" style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderTop: '4px solid #006688', borderRadius: '8px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px dashed #e2e8f0', paddingBottom: '16px' }}>
                <h4 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0 }}>정산 명세서</h4>
                <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0 0', fontFamily: 'monospace' }}>
                  PERIOD: {startDate.replace(/-/g, '.')} ~ {endDate.replace(/-/g, '.')}
                </p>
              </div>

              {/* 직원 정보 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>정산 대상자</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{statementModalData.staff_name} 님</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>정산 주기 / 커미션</span>
                <span style={{ fontWeight: 700, color: '#006688' }}>{statementModalData.settlement_cycle} / {statementModalData.commission_rate}%</span>
              </div>

              {/* 정산 세부 계산 내역 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px', background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#475569' }}>① 총 판매 실적 ({statementModalData.salesCount}개)</span>
                  <span style={{ fontWeight: 600 }}>₩{statementModalData.salesAmount.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #cbd5e1', paddingBottom: '8px', color: '#16a34a' }}>
                  <span>└ 판매 수수료 (+)</span>
                  <span style={{ fontWeight: 700 }}>+₩{statementModalData.salesCommission.toLocaleString()}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
                  <span style={{ color: '#475569' }}>② 총 환불 실적 ({statementModalData.refundCount}개)</span>
                  <span style={{ fontWeight: 600 }}>₩{statementModalData.refundAmount.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                  <span>└ 환불 수수료 차감 (-)</span>
                  <span style={{ fontWeight: 700 }}>-₩{statementModalData.refundCommission.toLocaleString()}</span>
                </div>
              </div>

              {/* 원천징수 및 최종 실수령액 */}
              <div style={{ borderTop: '2px dashed #006688', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#475569' }}>
                  <span>세전 수수료 합계</span>
                  <span style={{ fontWeight: 600 }}>₩{statementModalData.incentiveAmount.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#dc2626' }}>
                  <span>3.3% 원천징수 세액 (-)</span>
                  <span style={{ fontWeight: 600 }}>-₩{Math.round(statementModalData.incentiveAmount * 0.033).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#006688' }}>실수령액 (세후)</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#006688' }}>
                    ₩{(statementModalData.incentiveAmount - Math.round(statementModalData.incentiveAmount * 0.033)).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* 감사 문구 */}
              <div style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', borderTop: '1.5px solid #f1f5f9', paddingTop: '12px', whiteSpace: 'pre-wrap' }}>
                {invoiceMessage}
              </div>
            </div>

            <div className="modal-footer no-print" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
              <button
                onClick={() => handleCopyTextStatement(statementModalData)}
                style={{
                  padding: '8px 14px', background: '#f0f3ff', color: '#006688', border: '1px solid #bcc8d1',
                  borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span>
                카톡용 텍스트 복사
              </button>
              <button
                onClick={() => window.print()}
                style={{
                  padding: '8px 14px', background: '#006688', color: '#ffffff', border: 'none',
                  borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>print</span>
                인쇄하기
              </button>
              <button
                onClick={closeStatementModal}
                style={{ padding: '8px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
