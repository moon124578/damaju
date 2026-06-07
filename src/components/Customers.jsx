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

export default function Customers({ onDataChange }) {
  const [customers, setCustomers] = useState([]);
  const [staffs, setStaffs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // 검색, 필터 및 정렬 상태
  const [search, setSearch] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [blacklistFilter, setBlacklistFilter] = useState('일반');
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortConfig, setSortConfig] = useState({ key: 'customer_id', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);

  // 모달 관련 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [fieldEditModalOpen, setFieldEditModalOpen] = useState(false);
  const [editField, setEditField] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editCustId, setEditCustId] = useState(null);

  const [formData, setFormData] = useState({
    nickname: '',
    name: '',
    phone: '',
    address: '',
    is_blacklist: false,
  });


  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedStaffId, selectedStatus, blacklistFilter, itemsPerPage, sortConfig]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // 1. 직원 목록
      const { data: staffData } = await supabase
        .from('staffs')
        .select('*')
        .order('staff_id', { ascending: true });
      setStaffs(staffData || []);

      // 2. 고객 목록 & 주문 데이터 로드
      await reloadData();
    } catch (err) {
      console.error('Error fetching initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const reloadData = async () => {
    try {
      const { data: custData, error: custErr } = await supabase
        .from('customers')
        .select('*');
      if (custErr) throw custErr;

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
          customers (name, phone),
          staffs (staff_name)
        `);
      if (ordErr) throw ordErr;
      
      const ordersList = ordData || [];
      setOrders(ordersList);

      // 고객 데이터의 누적금액, 누적갯수, 주문횟수를 재조정합니다.
      const adjustedCustomers = (custData || []).map(c => {
        // 주문횟수: '주문 취소'가 아닌 모든 주문 건수 (총 주문 횟수)
        const totalOrdersForCust = ordersList.filter(o => o.customer_id === c.customer_id && o.order_status !== '주문 취소');
        const orderCount = totalOrdersForCust.length;

        // 판매갯수 및 판매금액: '배송 완료' 상태인 주문 건들로 계산
        const completedOrders = ordersList.filter(o => o.customer_id === c.customer_id && o.order_status === '배송 완료');
        const totalQuantity = completedOrders.reduce((sum, o) => sum + o.quantity, 0);
        const totalAmount = completedOrders.reduce((sum, o) => sum + o.total_price, 0);

        return {
          ...c,
          order_count: orderCount,
          total_quantity: totalQuantity,
          total_amount: totalAmount
        };
      });

      setCustomers(adjustedCustomers);
    } catch (err) {
      console.error('Error reloading data:', err);
    }
  };

  // 정렬 핸들러
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const openFieldEditModal = (custId, fieldName, currentVal) => {
    setEditCustId(custId);
    setEditField(fieldName);
    setEditValue(currentVal || '');
    setFieldEditModalOpen(true);
  };

  const handleSaveField = async () => {
    if (!editCustId) return;
    const trimmedVal = editValue.trim();
    if (editField === 'name' && !trimmedVal) {
      alert('고객명은 필수 항목입니다.');
      return;
    }

    try {
      const updatePayload = {};
      updatePayload[editField] = editField === 'phone' ? formatPhoneNumber(trimmedVal) : (trimmedVal || null);

      const { error } = await supabase
        .from('customers')
        .update(updatePayload)
        .eq('customer_id', editCustId);
      if (error) throw error;

      setFieldEditModalOpen(false);
      await reloadData();
      onDataChange();
      alert('회원 정보가 저장되었습니다.');
    } catch (err) {
      console.error(err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const openEditModal = (cust) => {
    setSelectedCustomer(cust);
    setFormData({
      nickname: cust.nickname || '',
      name: cust.name,
      phone: cust.phone,
      address: cust.address || '',
      is_blacklist: cust.is_blacklist || false,
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setSelectedCustomer(null);
    setFormData({
      nickname: '',
      name: '',
      phone: '',
      address: '',
      is_blacklist: false,
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() && !formData.nickname.trim()) {
      alert('닉네임 또는 고객명 중 최소 하나는 입력해야 합니다.');
      return;
    }

    const finalName = formData.name.trim() || formData.nickname.trim();
    const finalNickname = formData.nickname.trim() || null;
    const finalPhone = formatPhoneNumber(formData.phone.trim());
    const finalAddress = formData.address.trim() || null;

    try {
      if (selectedCustomer) {
        const { error } = await supabase
          .from('customers')
          .update({
            nickname: finalNickname,
            name: finalName,
            phone: finalPhone,
            address: finalAddress,
            is_blacklist: formData.is_blacklist,
          })
          .eq('customer_id', selectedCustomer.customer_id);
        if (error) throw error;
        alert('회원 정보가 수정되었습니다.');
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([{
            nickname: finalNickname,
            name: finalName,
            phone: finalPhone,
            address: finalAddress,
            is_blacklist: formData.is_blacklist,
          }]);
        if (error) throw error;
        alert('신규 회원이 추가되었습니다.');
      }

      setIsModalOpen(false);
      await reloadData();
      onDataChange();
    } catch (err) {
      console.error(err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  // 엑셀 일괄 다운로드 기능 (Sheet 1 + Sheet 2 병합 다운로드)
  const handleExcelDownload = () => {
    if (customers.length === 0) {
      alert('다운로드할 고객 정보가 없습니다.');
      return;
    }

    // Sheet 1: 고객 정보 DB
    const sheet1Data = filteredCustomers.map((c) => ({
      '고객 ID': c.customer_id,
      '닉네임': c.nickname || '',
      '고객명': c.name,
      '연락처': formatPhoneNumber(c.phone),
      '배송지 주소': c.address || '미입력',
      '주문 횟수': c.order_count,
      '판매 갯수': c.total_quantity,
      '취소 횟수': c.cancel_count,
      '판매 금액': c.total_amount,
      '마지막 주문일': c.last_order_date ? new Date(c.last_order_date).toLocaleString() : '-',
    }));
 
    // Sheet 2: 전체 주문 내역 DB
    // 필터링된 고객들의 주문 내역만 내보냄
    const allowedCustomerIds = new Set(filteredCustomers.map(c => c.customer_id));
    const targetOrders = orders.filter(o => allowedCustomerIds.has(o.customer_id));
 
    const sheet2Data = targetOrders.map((o) => ({
      '주문 ID': o.order_id,
      '주문일자': o.order_date ? new Date(o.order_date).toLocaleString() : '-',
      '고객명': o.customers?.name || '-',
      '연락처': o.customers?.phone ? formatPhoneNumber(o.customers.phone) : '-',
      '상품명': o.product_name,
      '수량': o.quantity,
      '단가': o.unit_price,
      '총 금액': o.total_price,
      '담당 직원': o.staffs?.staff_name || '-',
      '주문 상태': o.order_status,
    }));
 
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
    const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
 
    XLSX.utils.book_append_sheet(wb, ws1, '고객 정보 DB');
    XLSX.utils.book_append_sheet(wb, ws2, '전체 주문 내역 DB');
 
    XLSX.writeFile(wb, `라이브커머스_통합_CRM_데이터_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
 
 
  // 필터링 적용 로직
  const filteredCustomers = customers.filter((c) => {
    // 1. 검색어 필터 (이름, 닉네임 또는 연락처 - 초성 검색 지원)
    const matchSearch =
      matchChosung(c.name, search) ||
      (c.nickname && matchChosung(c.nickname, search)) ||
      c.phone.includes(search);
    if (!matchSearch) return false;
 
    // 해당 고객의 주문 목록
    const customerOrders = orders.filter((o) => o.customer_id === c.customer_id);
 
    // 2. 직원 필터
    if (selectedStaffId !== 'all') {
      const matchStaff = customerOrders.some((o) => o.staff_id?.toString() === selectedStaffId);
      if (!matchStaff) return false;
    }
 
    // 3. 상태 필터
    if (selectedStatus !== 'all') {
      const matchStatus = customerOrders.some((o) => o.order_status === selectedStatus);
      if (!matchStatus) return false;
    }
 
    // 블랙리스트 필터
    if (blacklistFilter === '일반' && c.is_blacklist) return false;
    if (blacklistFilter === '블랙리스트' && !c.is_blacklist) return false;
 
    return true;
  });
 
  // 정렬 적용
  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    const key = sortConfig.key;
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
 
    let valA = a[key];
    let valB = b[key];
 
    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * direction;
    }
    if (valA == null) return 1 * direction;
    if (valB == null) return -1 * direction;
 
    return (valA - valB) * direction;
  });
 
  const totalPages = Math.ceil(sortedCustomers.length / itemsPerPage) || 1;
  const displayedCustomers = sortedCustomers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
 
  return (
    <div className="content-area">
      <div className="content-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="content-title">회원 정보</h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            유입 회원의 누적 실적 조회 및 관리를 지원합니다. (페이지당 {itemsPerPage}명씩 노출)
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal} style={{ padding: '8px 16px', fontSize: '13px' }}>
          ➕ 신규 회원 추가
        </button>
      </div>
 
      {/* 필터 바 */}
      <div className="search-bar" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <input
          type="text"
          className="input-control"
          placeholder="고객 이름 또는 연락처 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 2, minWidth: '200px' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>상태:</span>
          <select
            className="input-control"
            value={blacklistFilter}
            onChange={(e) => setBlacklistFilter(e.target.value)}
            style={{ padding: '6px 12px' }}
          >
            <option value="일반">일반</option>
            <option value="블랙리스트">블랙리스트</option>
            <option value="전체">전체</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>보기:</span>
          <select
            className="input-control"
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            style={{ padding: '6px 12px' }}
          >
            <option value={20}>20명 보기</option>
            <option value={30}>30명 보기</option>
            <option value={40}>40명 보기</option>
            <option value={50}>50명 보기</option>
            <option value={100}>100명 보기</option>
          </select>
        </div>
      </div>
 
      {/* 고객 리스트 테이블 */}
      <div className="table-container" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>데이터 로드 중...</p>
        ) : (
          <table className="custom-table" style={{ fontSize: '12.5px' }}>
            <thead>
              <tr style={{ cursor: 'pointer' }}>
                <th onClick={() => handleSort('customer_id')}>ID {sortConfig.key === 'customer_id' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => handleSort('nickname')}>닉네임 {sortConfig.key === 'nickname' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => handleSort('name')}>고객명 {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => handleSort('phone')}>연락처 {sortConfig.key === 'phone' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => handleSort('address')}>배송지 주소 {sortConfig.key === 'address' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => handleSort('order_count')} style={{ textAlign: 'center' }}>주문횟수 {sortConfig.key === 'order_count' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => handleSort('total_quantity')} style={{ textAlign: 'center' }}>판매갯수 {sortConfig.key === 'total_quantity' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => handleSort('cancel_count')} style={{ textAlign: 'center' }}>취소횟수 {sortConfig.key === 'cancel_count' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => handleSort('total_amount')} style={{ textAlign: 'right' }}>판매금액 {sortConfig.key === 'total_amount' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => handleSort('last_order_date')}>마지막 주문일 {sortConfig.key === 'last_order_date' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
              </tr>
            </thead>
            <tbody>
              {displayedCustomers.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                    조건에 해당하는 회원이 없습니다.
                  </td>
                </tr>
              ) : (
                displayedCustomers.map((cust) => {
                  // 첫 구매자 식별: 주문 횟수 = 1 이고 주소지가 비어있음
                  const isFirstBuyerNoAddr = cust.order_count === 1 && (!cust.address || cust.address.trim() === '');
                  
                  return (
                    <tr key={cust.customer_id}>
                      <td>{cust.customer_id}</td>
                      <td 
                        style={{ fontWeight: 'bold', color: cust.is_blacklist ? 'var(--color-danger)' : 'var(--color-blue)', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(cust);
                        }}
                      >
                        {cust.nickname || (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', textDecoration: 'underline', fontWeight: 'normal', fontSize: '11px' }}>
                            닉네임 입력
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 'bold' }}>
                        {cust.name}
                      </td>
                      <td 
                        style={!(cust.phone && cust.phone.trim() !== '' && cust.phone !== '010-0000-0000') ? { cursor: 'pointer' } : {}}
                        onClick={(e) => {
                          const isPhoneFilled = cust.phone && cust.phone.trim() !== '' && cust.phone !== '010-0000-0000';
                          if (!isPhoneFilled) {
                            e.stopPropagation();
                            openFieldEditModal(cust.customer_id, 'phone', cust.phone);
                          }
                        }}
                      >
                        {cust.phone && cust.phone.trim() !== '' && cust.phone !== '010-0000-0000' ? (
                          formatPhoneNumber(cust.phone)
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', textDecoration: 'underline', fontSize: '11px' }}>
                            연락처 입력
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          maxWidth: '180px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: !(cust.address && cust.address.trim() !== '') ? 'pointer' : 'default'
                        }}
                        onClick={(e) => {
                          const isAddressFilled = cust.address && cust.address.trim() !== '';
                          if (!isAddressFilled) {
                            e.stopPropagation();
                            openFieldEditModal(cust.customer_id, 'address', cust.address);
                          }
                        }}
                        title={cust.address || ''}
                      >
                        {cust.address || (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', textDecoration: 'underline', fontSize: '11px' }}>
                            주소 입력
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: '600' }}>{cust.order_count}</td>
                      <td style={{ textAlign: 'center' }}>{cust.total_quantity}</td>
                      <td style={{ textAlign: 'center', color: cust.cancel_count > 0 ? 'var(--color-danger)' : 'inherit' }}>
                        {cust.cancel_count}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--color-mint-hover)' }}>
                        ₩ {cust.total_amount.toLocaleString()}
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {cust.last_order_date ? new Date(cust.last_order_date).toLocaleString() : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 페이지네이션 컨트롤 */}
      {sortedCustomers.length > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '16px' }}>
          <button 
            className="btn btn-secondary" 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            ◀ 이전
          </button>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
            {currentPage} / {totalPages} 페이지 (총 {sortedCustomers.length}명)
          </span>
          <button 
            className="btn btn-secondary" 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            다음 ▶
          </button>
        </div>
      )}

      {/* 단일 필드 inline 수정 모달 */}
      {fieldEditModalOpen && (
        <div className="modal-overlay" onClick={() => setFieldEditModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '380px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editField === 'nickname' && '닉네임 수정'}
                {editField === 'name' && '고객명 수정'}
                {editField === 'phone' && '연락처 수정'}
                {editField === 'address' && '배송지 주소 수정'}
              </h3>
              <button
                onClick={() => setFieldEditModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>
                  {editField === 'nickname' && '닉네임'}
                  {editField === 'name' && '고객명'}
                  {editField === 'phone' && '연락처'}
                  {editField === 'address' && '배송지 주소'}
                </label>
                <input
                  type="text"
                  className="input-control"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setFieldEditModalOpen(false)}>
                취소
              </button>
              <button className="btn btn-primary" onClick={handleSaveField}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{selectedCustomer ? '고객 정보 수정' : '신규 회원 추가'}</h3>
              <button
                onClick={handleCloseModal}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>닉네임</label>
                  <input
                    type="text"
                    className="input-control"
                    value={formData.nickname}
                    onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>고객명</label>
                  <input
                    type="text"
                    className="input-control"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>연락처</label>
                  <input
                    type="text"
                    className="input-control"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>배송지 주소</label>
                  <input
                    type="text"
                    className="input-control"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: selectedCustomer ? 'space-between' : 'flex-end' }}>
                {selectedCustomer && (
                  <button 
                    type="button" 
                    className={`btn ${formData.is_blacklist ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ background: formData.is_blacklist ? 'var(--color-danger)' : undefined, borderColor: formData.is_blacklist ? 'var(--color-danger)' : undefined }}
                    onClick={() => setFormData({ ...formData, is_blacklist: !formData.is_blacklist })}
                  >
                    {formData.is_blacklist ? '블랙리스트 해제' : '블랙리스트 등록'}
                  </button>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
                    취소
                  </button>
                  <button type="submit" className="btn btn-primary">
                    저장
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
