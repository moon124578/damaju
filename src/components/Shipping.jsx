import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    if (cleaned.startsWith('02')) {
      return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    }
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 9 && cleaned.startsWith('02')) {
    return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 5)}-${cleaned.slice(5)}`;
  }
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }
  return phone;
};

export default function Shipping({ onDataChange }) {
  const [shippingRows, setShippingRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndices, setSelectedIndices] = useState([]);

  useEffect(() => {
    fetchShippingData();
  }, []);

  const fetchShippingData = async () => {
    setLoading(true);
    try {
      // 오직 '입금 완료' 상태인 주문들을 로드합니다.
      const { data: ordData, error: ordErr } = await supabase
        .from('orders')
        .select(`
          order_id,
          order_date,
          customer_id,
          product_name,
          quantity,
          unit_price,
          total_price,
          order_status,
          invoice_id,
          customers (name, nickname, phone, address)
        `)
        .eq('order_status', '입금 완료')
        .order('order_date', { ascending: false });

      if (ordErr) throw ordErr;

      // 고객별(customer_id)로 묶기
      const customerMap = {};
      (ordData || []).forEach(o => {
        const cid = o.customer_id;
        if (!customerMap[cid]) {
          customerMap[cid] = {
            customer: o.customers || { name: '알 수 없음', nickname: '', phone: '', address: '' },
            order_date: o.order_date,
            order_status: o.order_status,
            items: []
          };
        }
        customerMap[cid].items.push(o);
      });

      // 각 고객별 총 갯수 합산
      const rows = Object.values(customerMap).map(group => {
        const orderIds = [];
        let totalQuantity = 0;

        group.items.forEach(item => {
          orderIds.push(item.order_id);
          totalQuantity += item.quantity;
        });

        return {
          customer: group.customer,
          order_date: group.order_date,
          order_status: group.order_status,
          totalQuantity,
          order_ids: orderIds
        };
      });

      setShippingRows(rows);
      setSelectedIndices([]); // 새 데이터 로드 시 체크 해제
    } catch (err) {
      console.error(err);
      alert('배송 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (orderIds, nextStatus, alertMessage) => {
    if (!orderIds || orderIds.length === 0) return;
    if (!window.confirm(alertMessage)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_status: nextStatus })
        .in('order_id', orderIds);

      if (error) throw error;
      
      await fetchShippingData();
      if (onDataChange) onDataChange();
      alert(`상태가 [${nextStatus}]로 변경되었습니다.`);
    } catch (err) {
      console.error(err);
      alert('상태 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 전체 선택/해제
  const handleToggleSelectAll = () => {
    if (selectedIndices.length === shippingRows.length) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(shippingRows.map((_, idx) => idx));
    }
  };

  // 개별 행 선택/해제
  const handleToggleSelectRow = (index) => {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter(i => i !== index));
    } else {
      setSelectedIndices([...selectedIndices, index]);
    }
  };

  // 선택 배송완료 일괄 처리
  const handleBulkCompleteShipping = async () => {
    if (selectedIndices.length === 0) {
      alert('배송 완료 처리할 대상을 선택해주세요.');
      return;
    }

    const allSelectedOrderIds = [];
    selectedIndices.forEach(idx => {
      allSelectedOrderIds.push(...shippingRows[idx].order_ids);
    });

    if (!window.confirm(`선택한 ${selectedIndices.length}명의 고객 (총 ${allSelectedOrderIds.length}개 품목)을 일괄 배송 완료 처리하시겠습니까?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_status: '배송 완료' })
        .in('order_id', allSelectedOrderIds);

      if (error) throw error;

      await fetchShippingData();
      if (onDataChange) onDataChange();
      alert('선택한 주문들이 성공적으로 배송 완료 처리되었습니다.');
    } catch (err) {
      console.error(err);
      alert('일괄 배송 완료 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 선택 입금해제 일괄 처리 (입금 완료 -> 정산서 발행 상태 복귀)
  const handleBulkRevertPayment = async () => {
    if (selectedIndices.length === 0) {
      alert('입금 완료를 해제할 대상을 선택해주세요.');
      return;
    }

    const allSelectedOrderIds = [];
    selectedIndices.forEach(idx => {
      allSelectedOrderIds.push(...shippingRows[idx].order_ids);
    });

    if (!window.confirm(`선택한 ${selectedIndices.length}명의 고객 (총 ${allSelectedOrderIds.length}개 품목)의 입금 완료를 해제하고 [정산서 발행] 상태로 되돌리시겠습니까?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_status: '정산서 발행' })
        .in('order_id', allSelectedOrderIds);

      if (error) throw error;

      await fetchShippingData();
      if (onDataChange) onDataChange();
      alert('선택한 주문들의 입금 완료 상태가 성공적으로 해제되었습니다. (정산서 발행 상태로 변경)');
    } catch (err) {
      console.error(err);
      alert('입금 완료 해제 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ fontFamily: "'Hanken Grotesk', 'Malgun Gothic', sans-serif", height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* 헤더 및 인쇄 버튼 */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>배송 관리</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            입금 완료 처리된 고객별 총 배송 수량을 확인하고 명단을 인쇄하거나 일괄 배송 완료 및 입금 해제 처리를 할 수 있습니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleBulkRevertPayment}
            disabled={selectedIndices.length === 0}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '10px 8px', background: selectedIndices.length > 0 ? '#ea580c' : '#cbd5e1',
              color: selectedIndices.length > 0 ? '#ffffff' : '#94a3b8',
              border: 'none', borderRadius: '8px', cursor: selectedIndices.length > 0 ? 'pointer' : 'not-allowed',
              fontSize: '11.5px', fontWeight: 700, transition: 'all 0.15s ease'
            }}
          >
            입금해제 ({selectedIndices.length})
          </button>
          <button
            onClick={handleBulkCompleteShipping}
            disabled={selectedIndices.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 18px', background: selectedIndices.length > 0 ? '#006b5c' : '#cbd5e1',
              color: selectedIndices.length > 0 ? '#ffffff' : '#94a3b8',
              border: 'none', borderRadius: '8px', cursor: selectedIndices.length > 0 ? 'pointer' : 'not-allowed',
              fontSize: '13px', fontWeight: 700, transition: 'all 0.15s ease'
            }}
          >
            <span className="material-symbols-outlined">local_shipping</span>
            선택 배송완료 ({selectedIndices.length}건)
          </button>
          <button
            onClick={handlePrint}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', background: '#006688', color: '#ffffff',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 700, transition: 'all 0.15s ease'
            }}
          >
            <span className="material-symbols-outlined">print</span>
            배송 명단 인쇄
          </button>
        </div>
      </div>

      {/* 출력 전용 초경량 컴팩트 스타일 인젝션 */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          .no-print {
            display: none !important;
          }
          .shipping-table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 11px !important;
            color: #000 !important;
          }
          .shipping-table th, .shipping-table td {
            border: 1px solid #333 !important;
            padding: 4px 6px !important;
            text-align: left !important;
            white-space: nowrap !important;
          }
          .shipping-table th {
            background-color: #f2f2f2 !important;
            font-weight: bold !important;
          }
          .shipping-table td.center {
            text-align: center !important;
          }
        }
      `}</style>

      {/* 배송 리스트 영역 (테이블 구조로 세련되고 촘촘하게 구성) */}
      <div id="print-area" style={{ flex: 1, overflowX: 'auto' }}>
        {loading && shippingRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>로딩 중...</div>
        ) : shippingRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
            입금 완료 상태의 배송 대상 주문이 없습니다.
          </div>
        ) : (
          <table className="shipping-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            <thead>
              <tr style={{ background: 'var(--border-color)', borderBottom: '2px solid var(--border-color)' }}>
                <th className="no-print" style={{ width: '40px', padding: '10px 12px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIndices.length === shippingRows.length && shippingRows.length > 0}
                    onChange={handleToggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, width: '120px' }}>닉네임[이름]</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, width: '110px' }}>연락처</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>주소</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, width: '70px' }}>총 갯수</th>
                <th className="no-print" style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, width: '150px' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {shippingRows.map((row, index) => {
                const { customer, order_ids, totalQuantity, order_status } = row;
                const isSelected = selectedIndices.includes(index);

                return (
                  <tr key={index} style={{ borderBottom: '1px solid var(--border-color)', background: isSelected ? 'rgba(0, 107, 92, 0.04)' : 'transparent' }}>
                    <td className="no-print" style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectRow(index)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    
                    {/* 1. 닉네임 [이름] */}
                    <td style={{ padding: '8px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {customer.nickname ? `[${customer.nickname}] ` : ''}{customer.name}
                    </td>

                    {/* 2. 연락처 */}
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatPhoneNumber(customer.phone)}
                    </td>

                    {/* 3. 주소 */}
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      {customer.address || '배송지 주소 미입력'}
                    </td>

                    {/* 4. 총 갯수 */}
                    <td className="center" style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#006688' }}>
                      {totalQuantity}개
                    </td>

                    {/* 5. 액션 관리 (프린트 비노출) */}
                    <td className="no-print" style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                          background: 'rgba(0, 107, 92, 0.1)',
                          color: '#006b5c'
                        }}>
                          {order_status}
                        </span>
                        <button
                          onClick={() => handleUpdateStatus(order_ids, '배송 완료', `${customer.name} 고객님의 품목들을 배송 완료 처리하시겠습니까?`)}
                          style={{
                            padding: '4px 8px', background: '#006b5c', color: '#ffffff',
                            border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>local_shipping</span>
                          배송 완료
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
