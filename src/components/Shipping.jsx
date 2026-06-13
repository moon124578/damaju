import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import * as XLSX from 'xlsx';
import { matchChosung } from '../hangulSearch';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'shippingFee' | 'keep' | 'none'

  // 고객 정보 수정 모달 상태
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editCustomerId, setEditCustomerId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    nickname: '',
    name: '',
    phone: '',
    address: '',
  });

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
          shipping_fee_paid,
          is_keep,
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
            customer_id: cid,
            customer: o.customers || { name: '알 수 없음', nickname: '', phone: '', address: '' },
            order_date: o.order_date,
            order_status: o.order_status,
            items: []
          };
        }
        customerMap[cid].items.push(o);
      });

      // 각 고객별 총 갯수 합산 + 배송비/Keep 플래그 집계
      const rows = Object.values(customerMap).map(group => {
        const orderIds = [];
        let totalQuantity = 0;
        const dateQuantityMap = {};
        let hasShippingFeePaid = false;
        let hasKeep = false;

        group.items.forEach(item => {
          orderIds.push(item.order_id);
          totalQuantity += item.quantity;
          const dateObj = new Date(item.order_date);
          const day = dateObj.getDate();
          if (!dateQuantityMap[day]) {
            dateQuantityMap[day] = 0;
          }
          dateQuantityMap[day] += item.quantity;

          if (item.shipping_fee_paid) hasShippingFeePaid = true;
          if (item.is_keep) hasKeep = true;
        });

        const dateQuantityArray = Object.keys(dateQuantityMap)
          .sort((a, b) => Number(a) - Number(b))
          .map(day => `${day}일 ${dateQuantityMap[day]}개`);

        return {
          customer_id: group.customer_id,
          customer: group.customer,
          order_date: group.order_date,
          order_status: group.order_status,
          totalQuantity,
          dateQuantityArray,
          order_ids: orderIds,
          hasShippingFeePaid,
          hasKeep
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

  const handleDownloadWaybill = async () => {
    if (shippingRows.length === 0) {
      alert('출력할 배송 정보가 없습니다.');
      return;
    }

    try {
      const response = await fetch('/songjang.xlsx');
      if (!response.ok) {
        throw new Error('songjang.xlsx 파일을 찾을 수 없습니다.');
      }
      const arrayBuffer = await response.arrayBuffer();

      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const data = shippingRows.map(row => {
        const name = row.customer.name && row.customer.name !== '알 수 없음' ? row.customer.name : (row.customer.nickname || '이름 없음');
        const phone = formatPhoneNumber(row.customer.phone);
        const address = row.customer.address || '';
        const category = '의류';
        const quantity = row.totalQuantity;

        return [name, phone, address, category, quantity];
      });

      XLSX.utils.sheet_add_aoa(worksheet, data, { origin: "A2" });

      const today = new Date();
      const year = today.getFullYear();
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const day = today.getDate().toString().padStart(2, '0');
      const hours = today.getHours().toString().padStart(2, '0');
      const minutes = today.getMinutes().toString().padStart(2, '0');
      const seconds = today.getSeconds().toString().padStart(2, '0');
      const dateStr = `${year}${month}${day}${hours}${minutes}${seconds}`;
      XLSX.writeFile(workbook, `${dateStr}택배.xlsx`);
    } catch (error) {
      console.error('엑셀 생성 중 오류 발생:', error);
      alert('택배송장 엑셀 파일을 생성하는 중 오류가 발생했습니다. (' + error.message + ')');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // 배송비완료/Keep 토글 핸들러
  const handleToggleFlag = async (orderIds, field, currentValue, customerName) => {
    const label = field === 'shipping_fee_paid' ? '배송비 완료' : 'Keep';
    const nextValue = !currentValue;
    const action = nextValue ? '설정' : '해제';
    if (!window.confirm(`${customerName} 고객의 ${label}을(를) ${action}하시겠습니까?`)) return;
    setLoading(true);
    try {
      const updatePayload = {};
      updatePayload[field] = nextValue;
      const { error } = await supabase
        .from('orders')
        .update(updatePayload)
        .in('order_id', orderIds);
      if (error) throw error;
      await fetchShippingData();
      if (onDataChange) onDataChange();
    } catch (err) {
      console.error(err);
      alert('상태 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 닉네임 클릭 → 고객 정보 수정 모달 열기
  const openEditModal = (row) => {
    setEditCustomerId(row.customer_id);
    setEditFormData({
      nickname: row.customer.nickname || '',
      name: row.customer.name || '',
      phone: row.customer.phone || '',
      address: row.customer.address || '',
    });
    setEditModalOpen(true);
  };

  const handleSaveCustomer = async () => {
    if (!editCustomerId) return;
    if (!editFormData.name.trim() && !editFormData.nickname.trim()) {
      alert('닉네임 또는 고객명 중 최소 하나는 입력해야 합니다.');
      return;
    }
    try {
      const { error } = await supabase
        .from('customers')
        .update({
          nickname: editFormData.nickname.trim() || null,
          name: editFormData.name.trim() || editFormData.nickname.trim(),
          phone: formatPhoneNumber(editFormData.phone.trim()),
          address: editFormData.address.trim() || null,
        })
        .eq('customer_id', editCustomerId);
      if (error) throw error;
      setEditModalOpen(false);
      await fetchShippingData();
      if (onDataChange) onDataChange();
      alert('회원 정보가 수정되었습니다.');
    } catch (err) {
      console.error(err);
      alert('저장 중 오류가 발생했습니다.');
    }
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
          {/* 범례 표시 */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginRight: '8px' }}>
            <span style={{ 
              fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
              background: 'rgba(0, 107, 92, 0.1)', color: '#006b5c', border: '1px solid rgba(0, 107, 92, 0.2)'
            }}>
              🚚 배송비완료
            </span>
            <span style={{ 
              fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px',
              background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', border: '1px solid rgba(124, 58, 237, 0.2)'
            }}>
              📦 Keep
            </span>
          </div>
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
          <button
            onClick={handleDownloadWaybill}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', background: '#475569', color: '#ffffff',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 700, transition: 'all 0.15s ease'
            }}
          >
            <span className="material-symbols-outlined">receipt_long</span>
            택배송장
          </button>
        </div>
      </div>

      {/* 검색창 + 필터 탭 */}
      <div className="no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="이름, 닉네임, 연락처로 검색 (초성 지원)..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSelectedIndices([]); }}
          style={{
            flex: 1, maxWidth: '300px', padding: '10px 12px',
            border: '1px solid var(--border-color)', borderRadius: '8px',
            fontSize: '13px', outline: 'none', background: 'var(--bg-card)',
            color: 'var(--text-primary)'
          }}
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setSelectedIndices([]); }}
            style={{
              padding: '8px 12px', background: 'transparent', border: '1px solid var(--border-color)',
              borderRadius: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: '4px'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
          </button>
        )}

        {/* 구분 필터 탭 */}
        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
          {[
            { key: 'all', label: '전체' },
            { key: 'shippingFee', label: '🚚 배송비완료' },
            { key: 'keep', label: '📦 Keep' },
            { key: 'none', label: '미설정' },
          ].map(tab => {
            const isActive = statusFilter === tab.key;
            let activeBg = '#006688';
            let activeColor = '#ffffff';
            if (tab.key === 'shippingFee') { activeBg = '#006b5c'; }
            if (tab.key === 'keep') { activeBg = '#7c3aed'; }
            if (tab.key === 'none') { activeBg = '#64748b'; }
            return (
              <button
                key={tab.key}
                onClick={() => { setStatusFilter(tab.key); setSelectedIndices([]); }}
                style={{
                  padding: '6px 12px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700,
                  border: isActive ? 'none' : '1px solid var(--border-color)',
                  background: isActive ? activeBg : 'transparent',
                  color: isActive ? activeColor : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            );
          })}
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
        {(() => {
          const filteredRows = shippingRows.filter(row => {
            // 검색 필터
            if (searchQuery) {
              const { customer } = row;
              const nameMatch = matchChosung(customer.name, searchQuery);
              const nickMatch = customer.nickname && matchChosung(customer.nickname, searchQuery);
              const phoneMatch = customer.phone && customer.phone.includes(searchQuery);
              if (!nameMatch && !nickMatch && !phoneMatch) return false;
            }
            // 상태 필터
            if (statusFilter === 'shippingFee' && !row.hasShippingFeePaid) return false;
            if (statusFilter === 'keep' && !row.hasKeep) return false;
            if (statusFilter === 'none' && (row.hasShippingFeePaid || row.hasKeep)) return false;
            return true;
          });
          
          if (loading && shippingRows.length === 0) return (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>로딩 중...</div>
          );
          if (filteredRows.length === 0) return (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
              {searchQuery ? '검색 결과가 없습니다.' : '입금 완료 상태의 배송 대상 주문이 없습니다.'}
            </div>
          );
          return (
          <table className="shipping-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            <thead>
              <tr style={{ background: 'var(--border-color)', borderBottom: '2px solid var(--border-color)' }}>
                <th className="no-print" style={{ width: '40px', padding: '10px 12px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIndices.length === filteredRows.length && filteredRows.length > 0}
                    onChange={() => {
                      if (selectedIndices.length === filteredRows.length) {
                        setSelectedIndices([]);
                      } else {
                        setSelectedIndices(filteredRows.map((_, idx) => idx));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, width: '120px' }}>닉네임[이름]</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, width: '110px' }}>연락처</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>주소</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, width: '120px' }}>일자별 갯수</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, width: '70px' }}>총 갯수</th>
                <th className="no-print" style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, width: '230px' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => {
                const { customer, order_ids, totalQuantity, order_status, hasShippingFeePaid, hasKeep } = row;
                const isSelected = selectedIndices.includes(index);

                // 배송비완료/Keep 상태에 따른 행 배경색 결정
                let rowBg = 'transparent';
                let rowLeftBorder = 'none';
                if (isSelected) {
                  rowBg = 'rgba(0, 107, 92, 0.04)';
                } else if (hasShippingFeePaid && hasKeep) {
                  rowBg = 'linear-gradient(90deg, rgba(0, 107, 92, 0.06) 0%, rgba(124, 58, 237, 0.06) 100%)';
                  rowLeftBorder = '3px solid #7c3aed';
                } else if (hasKeep) {
                  rowBg = 'rgba(124, 58, 237, 0.05)';
                  rowLeftBorder = '3px solid #7c3aed';
                } else if (hasShippingFeePaid) {
                  rowBg = 'rgba(0, 107, 92, 0.05)';
                  rowLeftBorder = '3px solid #006b5c';
                }

                return (
                  <tr key={index} style={{ borderBottom: '1px solid var(--border-color)', background: rowBg.includes('gradient') ? undefined : rowBg, backgroundImage: rowBg.includes('gradient') ? rowBg : undefined, borderLeft: rowLeftBorder }}>
                    <td className="no-print" style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectRow(index)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    
                    {/* 1. 닉네임 [이름] - 클릭 시 고객 정보 편집 */}
                    <td 
                      style={{ padding: '8px 12px', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', color: 'var(--color-blue, #006688)' }}
                      onClick={(e) => { e.stopPropagation(); openEditModal(row); }}
                      title="클릭하여 고객 정보 수정"
                    >
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

                    {/* 3.5 일자별 갯수 */}
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {row.dateQuantityArray && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                          {Array.from({ length: Math.ceil(row.dateQuantityArray.length / 3) }).map((_, i) => (
                            <div key={i} style={{ whiteSpace: 'nowrap' }}>
                              {row.dateQuantityArray.slice(i * 3, i * 3 + 3).join(' / ')}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* 4. 총 갯수 */}
                    <td className="center" style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#006688' }}>
                      {totalQuantity}개
                    </td>

                    {/* 5. 액션 관리 (프린트 비노출) */}
                    <td className="no-print" style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleToggleFlag(order_ids, 'shipping_fee_paid', hasShippingFeePaid, customer.name)}
                          style={{
                            padding: '3px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
                            border: hasShippingFeePaid ? '1px solid #006b5c' : '1px dashed #94a3b8',
                            background: hasShippingFeePaid ? 'rgba(0, 107, 92, 0.12)' : 'transparent',
                            color: hasShippingFeePaid ? '#006b5c' : '#94a3b8',
                            cursor: 'pointer', transition: 'all 0.15s ease'
                          }}
                          title={hasShippingFeePaid ? '배송비 완료 해제' : '배송비 완료 설정'}
                        >
                          🚚 배송비 {hasShippingFeePaid ? '✓' : ''}
                        </button>
                        <button
                          onClick={() => handleToggleFlag(order_ids, 'is_keep', hasKeep, customer.name)}
                          style={{
                            padding: '3px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
                            border: hasKeep ? '1px solid #7c3aed' : '1px dashed #94a3b8',
                            background: hasKeep ? 'rgba(124, 58, 237, 0.12)' : 'transparent',
                            color: hasKeep ? '#7c3aed' : '#94a3b8',
                            cursor: 'pointer', transition: 'all 0.15s ease'
                          }}
                          title={hasKeep ? 'Keep 해제' : 'Keep 설정'}
                        >
                          📦 Keep {hasKeep ? '✓' : ''}
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(order_ids, '배송 완료', `${customer.name} 고객님의 품목들을 배송 완료 처리하시겠습니까?`)}
                          style={{
                            padding: '4px 8px', background: '#006b5c', color: '#ffffff',
                            border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>local_shipping</span>
                          배송
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          );
        })()}
      </div>

      {/* 고객 정보 수정 모달 */}
      {editModalOpen && (
        <div
          onClick={() => setEditModalOpen(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card, #ffffff)', borderRadius: '12px', width: '400px', maxWidth: '90vw',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden'
            }}
          >
            {/* 헤더 */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px', borderBottom: '1px solid var(--border-color, #e2e8f0)'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary, #151c27)' }}>고객 정보 수정</h3>
              <button
                onClick={() => setEditModalOpen(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted, #6d7980)', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>

            {/* 본문 */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted, #6d7980)', marginBottom: '4px', display: 'block' }}>닉네임</label>
                <input
                  type="text"
                  value={editFormData.nickname}
                  onChange={(e) => setEditFormData({ ...editFormData, nickname: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid var(--border-color, #bcc8d1)',
                    borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                    background: 'var(--bg-card, #ffffff)', color: 'var(--text-primary, #151c27)'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted, #6d7980)', marginBottom: '4px', display: 'block' }}>고객명</label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid var(--border-color, #bcc8d1)',
                    borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                    background: 'var(--bg-card, #ffffff)', color: 'var(--text-primary, #151c27)'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted, #6d7980)', marginBottom: '4px', display: 'block' }}>연락처</label>
                <input
                  type="text"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid var(--border-color, #bcc8d1)',
                    borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                    background: 'var(--bg-card, #ffffff)', color: 'var(--text-primary, #151c27)'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted, #6d7980)', marginBottom: '4px', display: 'block' }}>배송지 주소</label>
                <input
                  type="text"
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid var(--border-color, #bcc8d1)',
                    borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                    background: 'var(--bg-card, #ffffff)', color: 'var(--text-primary, #151c27)'
                  }}
                />
              </div>
            </div>

            {/* 푸터 */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: '8px',
              padding: '16px 20px', borderTop: '1px solid var(--border-color, #e2e8f0)'
            }}>
              <button
                onClick={() => setEditModalOpen(false)}
                style={{
                  padding: '10px 18px', background: 'transparent', border: '1px solid var(--border-color, #bcc8d1)',
                  borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  color: 'var(--text-muted, #6d7980)'
                }}
              >
                취소
              </button>
              <button
                onClick={handleSaveCustomer}
                style={{
                  padding: '10px 18px', background: '#006688', color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
