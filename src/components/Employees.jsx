import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Employees({ onDataChange }) {
  const [staffs, setStaffs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // 날짜 검색 상태 (디폴트: 당월 1일부터 오늘까지)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 직원 추가/수정 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null); // null 이면 추가
  const [formData, setFormData] = useState({
    staff_name: '',
    commission_rate: 5.0,
  });

  useEffect(() => {
    // 기본 날짜 설정
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    setStartDate(`${year}-${month}-01`);
    setEndDate(`${year}-${month}-${day}`);

    fetchStaffs();
  }, []);

  const fetchStaffs = async () => {
    setLoading(true);
    try {
      const { data: staffData, error: sErr } = await supabase
        .from('staffs')
        .select('*')
        .order('staff_id', { ascending: true });
      if (sErr) throw sErr;
      setStaffs(staffData || []);

      const { data: ordData, error: oErr } = await supabase
        .from('orders')
        .select(`
          order_id,
          total_price,
          order_date,
          order_status,
          staff_id
        `);
      if (oErr) throw oErr;
      setOrders(ordData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setSelectedStaff(null);
    setFormData({
      staff_name: '',
      commission_rate: 5.0,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (staff) => {
    setSelectedStaff(staff);
    setFormData({
      staff_name: staff.staff_name,
      commission_rate: parseFloat(staff.commission_rate),
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
        // 수정
        const { error } = await supabase
          .from('staffs')
          .update({
            staff_name: formData.staff_name.trim(),
            commission_rate: parseFloat(formData.commission_rate),
          })
          .eq('staff_id', selectedStaff.staff_id);
        if (error) throw error;
        alert('직원 정보가 수정되었습니다.');
      } else {
        // 추가
        const { error } = await supabase
          .from('staffs')
          .insert({
            staff_name: formData.staff_name.trim(),
            commission_rate: parseFloat(formData.commission_rate),
          });
        if (error) throw error;
        alert('직원이 등록되었습니다.');
      }

      setIsModalOpen(false);
      await fetchStaffs();
      onDataChange();
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
      await fetchStaffs();
      onDataChange();
    } catch (err) {
      console.error(err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // 인센티브 정산 연산 함수
  const calculateIncentives = () => {
    const start = startDate ? new Date(startDate + 'T00:00:00') : new Date('2000-01-01');
    const end = endDate ? new Date(endDate + 'T23:59:59') : new Date('2100-12-31');

    // 1. 기간 내 완료된 주문 필터링 (주문취소 제외)
    const filteredOrders = orders.filter((o) => {
      if (o.order_status === '주문 취소' || !o.order_date) return false;
      const orderTime = new Date(o.order_date);
      return orderTime >= start && orderTime <= end;
    });

    // 2. 직원별 실적 집계
    return staffs.map((s) => {
      const staffOrders = filteredOrders.filter((o) => o.staff_id === s.staff_id);
      const totalSales = staffOrders.reduce((sum, o) => sum + o.total_price, 0);
      const incentive = Math.round(totalSales * (parseFloat(s.commission_rate) / 100));

      return {
        ...s,
        totalSales,
        incentive,
        orderCount: staffOrders.length,
      };
    });
  };

  const incentiveList = calculateIncentives();
  const grandTotalSales = incentiveList.reduce((sum, s) => sum + s.totalSales, 0);
  const grandTotalIncentive = incentiveList.reduce((sum, s) => sum + s.incentive, 0);

  return (
    <div className="content-area">
      <div className="content-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="content-title">직원 기여도 및 인센티브 정산</h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            직원별 고정 커미션 비율을 관리하고 지정된 기간 내 매출 기여 인센티브 지급액을 자동 계산합니다.
          </p>
        </div>
      </div>

      <div className="splitter-container" style={{ gap: '24px' }}>
        {/* 좌측: 직원 목록 및 비율 수정 */}
        <div className="splitter-left glass-card" style={{ padding: '20px', flex: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold' }}>직원 정보 및 커미션 비율</h3>
            <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={openAddModal}>
              ➕ 직원 추가
            </button>
          </div>

          <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>로딩 중...</p>
            ) : (
              <table className="custom-table" style={{ fontSize: '12.5px' }}>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th style={{ textAlign: 'center' }}>인센티브 커미션율</th>
                    <th style={{ textAlign: 'center' }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {staffs.length === 0 ? (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>
                        등록된 직원이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    staffs.map((s) => (
                      <tr key={s.staff_id}>
                        <td style={{ fontWeight: '600' }}>{s.staff_name}</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--color-mint-hover)' }}>
                          {s.commission_rate} %
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
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
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 우측: 인센티브 기간 조회 정산기 */}
        <div className="splitter-right glass-card" style={{ padding: '20px', flex: 6 }}>
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '16px' }}>
            💰 기간별 기여 매출 및 인센티브 지급 조회
          </h3>

          {/* 기간 필터 설정 */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ fontSize: '11px' }}>조회 시작일</label>
              <input
                type="date"
                className="input-control"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ padding: '6px' }}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ fontSize: '11px' }}>조회 종료일</label>
              <input
                type="date"
                className="input-control"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ padding: '6px' }}
              />
            </div>
          </div>

          {/* 간이 정산 통계 박스 */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div className="glass-card" style={{ padding: '12px', flex: 1, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>기간 내 총 매출액</span>
              <span style={{ display: 'block', fontSize: '16px', fontWeight: 'bold', color: 'var(--color-blue)', marginTop: '4px' }}>
                ₩ {grandTotalSales.toLocaleString()}
              </span>
            </div>
            <div className="glass-card" style={{ padding: '12px', flex: 1, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <span style={{ fontSize: '11px', color: '#16a34a' }}>총 지급 예정 인센티브</span>
              <span style={{ display: 'block', fontSize: '16px', fontWeight: 'bold', color: '#16a34a', marginTop: '4px' }}>
                ₩ {grandTotalIncentive.toLocaleString()}
              </span>
            </div>
          </div>

          {/* 정산 계산 결과 테이블 */}
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            <table className="custom-table" style={{ fontSize: '12px' }}>
              <thead style={{ backgroundColor: '#f8fafc' }}>
                <tr>
                  <th>직원명</th>
                  <th style={{ textAlign: 'center' }}>수수료율</th>
                  <th style={{ textAlign: 'center' }}>유치 건수</th>
                  <th style={{ textAlign: 'right' }}>유치 매출액</th>
                  <th style={{ textAlign: 'right', color: '#16a34a' }}>최종 지급 인센티브</th>
                </tr>
              </thead>
              <tbody>
                {incentiveList.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>
                      산출할 내역이 존재하지 않습니다.
                    </td>
                  </tr>
                ) : (
                  incentiveList.map((s) => (
                    <tr key={s.staff_id}>
                      <td style={{ fontWeight: '600' }}>{s.staff_name}</td>
                      <td style={{ textAlign: 'center' }}>{s.commission_rate} %</td>
                      <td style={{ textAlign: 'center' }}>{s.orderCount} 건</td>
                      <td style={{ textAlign: 'right', fontWeight: '500' }}>
                        ₩ {s.totalSales.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>
                        ₩ {s.incentive.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
              <div className="modal-body">
                <div className="form-group">
                  <label>직원명 *</label>
                  <input
                    type="text"
                    className="input-control"
                    value={formData.staff_name}
                    onChange={(e) => setFormData({ ...formData, staff_name: e.target.value })}
                    required
                    disabled={!!selectedStaff} // 수정 시 이름 수정 불가 (선택적)
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
    </div>
  );
}
