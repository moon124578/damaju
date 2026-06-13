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

  // 닉네임 중복 확인 상태
  const [nickCheckStatus, setNickCheckStatus] = useState('idle'); // 'idle' | 'checking' | 'ok' | 'duplicate'
  const [nickCheckedValue, setNickCheckedValue] = useState(''); // 마지막으로 체크한 닉네임
  const [similarNicknames, setSimilarNicknames] = useState([]); // 유사/중복 닉네임 목록

  // 중복 회원 정리 모달 관련 상태
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [selectedMainIds, setSelectedMainIds] = useState({}); // { groupId: mainCustId }
  const [selectedMergeIds, setSelectedMergeIds] = useState({}); // { groupId: [custId1, custId2, ...] }
  const [isMerging, setIsMerging] = useState(false);


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
    setNickCheckStatus('idle');
    setNickCheckedValue('');
    setSimilarNicknames([]);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // 닉네임 중복 확인
  const handleCheckDuplicate = () => {
    const nick = formData.nickname.trim();
    if (!nick) {
      alert('닉네임을 입력해주세요.');
      return;
    }
    setNickCheckStatus('checking');

    // 정확히 일치하는 닉네임 찾기
    const exactMatch = customers.filter(c => c.nickname && c.nickname === nick);
    // 포함되거나 유사한 닉네임 찾기 (수정 중인 고객 제외)
    const similar = customers.filter(c => {
      if (selectedCustomer && c.customer_id === selectedCustomer.customer_id) return false;
      if (!c.nickname) return false;
      if (c.nickname === nick) return true;
      // 포함 관계
      if (c.nickname.includes(nick) || nick.includes(c.nickname)) return true;
      // 초성 매치
      if (matchChosung(c.nickname, nick)) return true;
      return false;
    });

    setSimilarNicknames(similar);
    setNickCheckedValue(nick);

    if (exactMatch.length > 0 && !(selectedCustomer && exactMatch.every(c => c.customer_id === selectedCustomer.customer_id))) {
      setNickCheckStatus('duplicate');
    } else {
      setNickCheckStatus('ok');
    }
  };

  // 중복 예상 그룹을 찾아내는 헬퍼 함수
  const findDuplicateGroups = (custs) => {
    const groups = [];
    const visited = new Set();

    for (let i = 0; i < custs.length; i++) {
      const c1 = custs[i];
      if (!c1.nickname || !c1.nickname.trim()) continue;
      if (visited.has(c1.customer_id)) continue;

      const groupMembers = [c1];
      const n1 = c1.nickname.replace(/\s+/g, '').toLowerCase();

      for (let j = 0; j < custs.length; j++) {
        if (i === j) continue;
        const c2 = custs[j];
        if (!c2.nickname || !c2.nickname.trim()) continue;
        if (visited.has(c2.customer_id)) continue;

        const n2 = c2.nickname.replace(/\s+/g, '').toLowerCase();

        let isSimilar = false;
        if (n1 === n2) {
          isSimilar = true;
        } else if (n1.includes(n2) || n2.includes(n1)) {
          const lenDiff = Math.abs(n1.length - n2.length);
          if (Math.min(n1.length, n2.length) >= 2 && lenDiff <= 2) {
            isSimilar = true;
          }
        } else if (matchChosung(c1.nickname, c2.nickname) || matchChosung(c2.nickname, c1.nickname)) {
          isSimilar = true;
        }

        if (isSimilar) {
          groupMembers.push(c2);
        }
      }

      if (groupMembers.length > 1) {
        groupMembers.forEach(m => visited.add(m.customer_id));
        const groupId = `group_${c1.customer_id}`;
        groups.push({
          id: groupId,
          representativeName: c1.nickname,
          members: groupMembers
        });
      }
    }

    return groups;
  };

  const openMergeModal = () => {
    const groups = findDuplicateGroups(customers);
    setDuplicateGroups(groups);
    
    const initialMains = {};
    const initialMerges = {};
    groups.forEach(g => {
      initialMains[g.id] = g.members[0].customer_id;
      initialMerges[g.id] = g.members.slice(1).map(m => m.customer_id);
    });
    
    setSelectedMainIds(initialMains);
    setSelectedMergeIds(initialMerges);
    setIsMergeModalOpen(true);
  };

  const handleExecuteMerge = async (groupId) => {
    const mainId = selectedMainIds[groupId];
    const mergeIds = selectedMergeIds[groupId] || [];

    if (!mainId) {
      alert('유지할 대표 회원을 선택해주세요.');
      return;
    }
    if (mergeIds.length === 0) {
      alert('병합할 대상을 하나 이상 체크해주세요.');
      return;
    }

    const mainCust = customers.find(c => c.customer_id === mainId);
    const targetNames = mergeIds.map(id => {
      const c = customers.find(x => x.customer_id === id);
      return c ? `${c.nickname || c.name}(ID: ${c.customer_id})` : id;
    }).join(', ');

    if (!window.confirm(`[${targetNames}] 회원을 [${mainCust.nickname || mainCust.name}] 회원으로 병합하시겠습니까?\n병합된 회원의 주문 내역은 이전되고, 해당 회원은 영구 삭제됩니다.`)) {
      return;
    }

    setIsMerging(true);
    try {
      // 1. 주문 테이블의 customer_id 업데이트
      const { error: ordErr } = await supabase
        .from('orders')
        .update({ customer_id: mainId })
        .in('customer_id', mergeIds);

      if (ordErr) throw ordErr;

      // 2. 비어 있는 대표 고객 정보 채우기
      let updatedPhone = mainCust.phone;
      let updatedAddress = mainCust.address;
      let updatedName = mainCust.name;

      mergeIds.forEach(id => {
        const c = customers.find(x => x.customer_id === id);
        if (c) {
          if ((!updatedPhone || updatedPhone === '010-0000-0000') && c.phone && c.phone !== '010-0000-0000') {
            updatedPhone = c.phone;
          }
          if (!updatedAddress && c.address) {
            updatedAddress = c.address;
          }
          if (updatedName === '이름 미입력' || updatedName === updatedPhone) {
            if (c.name && c.name !== '이름 미입력') updatedName = c.name;
          }
        }
      });

      const { error: custUpdateErr } = await supabase
        .from('customers')
        .update({
          phone: updatedPhone,
          address: updatedAddress,
          name: updatedName
        })
        .eq('customer_id', mainId);

      if (custUpdateErr) throw custUpdateErr;

      // 3. 병합 대상 고객들 삭제
      const { error: delErr } = await supabase
        .from('customers')
        .delete()
        .in('customer_id', mergeIds);

      if (delErr) throw delErr;

      alert('성공적으로 병합되었습니다.');

      await reloadData();
      onDataChange();

      const newGroups = findDuplicateGroups(customers.filter(c => !mergeIds.includes(c.customer_id)));
      setDuplicateGroups(newGroups);

      const newMains = { ...selectedMainIds };
      const newMerges = { ...selectedMergeIds };
      delete newMains[groupId];
      delete newMerges[groupId];
      
      newGroups.forEach(g => {
        if (!newMains[g.id]) {
          newMains[g.id] = g.members[0].customer_id;
          newMerges[g.id] = g.members.slice(1).map(m => m.customer_id);
        }
      });
      setSelectedMainIds(newMains);
      setSelectedMergeIds(newMerges);

      if (newGroups.length === 0) {
        alert('더 이상 발견된 중복 회원이 없습니다.');
        setIsMergeModalOpen(false);
      }
    } catch (err) {
      console.error('Error merging customers:', err);
      alert('병합 처리 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsMerging(false);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() && !formData.nickname.trim()) {
      alert('닉네임 또는 고객명 중 최소 하나는 입력해야 합니다.');
      return;
    }

    // 신규 등록 시 닉네임 중복 확인 필수
    if (!selectedCustomer && formData.nickname.trim()) {
      if (nickCheckStatus !== 'ok' || nickCheckedValue !== formData.nickname.trim()) {
        alert('닉네임 중복 확인을 먼저 진행해주세요.');
        return;
      }
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={openMergeModal} style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            🔍 중복 회원 정리
          </button>
          <button className="btn btn-primary" onClick={openAddModal} style={{ padding: '8px 16px', fontSize: '13px' }}>
            ➕ 신규 회원 추가
          </button>
        </div>
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
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      className="input-control"
                      value={formData.nickname}
                      onChange={(e) => {
                        setFormData({ ...formData, nickname: e.target.value });
                        // 닉네임 변경 시 체크 상태 초기화
                        if (nickCheckedValue !== e.target.value.trim()) {
                          setNickCheckStatus('idle');
                          setSimilarNicknames([]);
                        }
                      }}
                      style={{ flex: 1 }}
                    />
                    {!selectedCustomer && (
                      <button
                        type="button"
                        onClick={handleCheckDuplicate}
                        style={{
                          padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                          border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                          background: nickCheckStatus === 'ok' ? '#006b5c' : nickCheckStatus === 'duplicate' ? '#dc2626' : '#006688',
                          color: '#ffffff', transition: 'all 0.15s ease'
                        }}
                      >
                        {nickCheckStatus === 'ok' ? '✓ 사용가능' : nickCheckStatus === 'duplicate' ? '✗ 중복' : '중복확인'}
                      </button>
                    )}
                  </div>
                  {/* 중복/유사 닉네임 결과 표시 */}
                  {nickCheckStatus === 'duplicate' && (
                    <div style={{ marginTop: '8px', padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px' }}>
                      <p style={{ fontSize: '12px', color: '#dc2626', fontWeight: 700, margin: '0 0 6px 0' }}>
                        ⚠️ 동일한 닉네임이 존재합니다!
                      </p>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {similarNicknames.map(c => (
                          <li key={c.customer_id} style={{ display: 'flex', padding: '6px 8px', background: '#ffffff', borderRadius: '4px', border: '1px solid #e5e7eb', fontSize: '12px' }}>
                            <div>
                              <span style={{ fontWeight: 700, color: '#151c27' }}>{c.nickname || '-'}</span>
                              <span style={{ color: '#6b7280', marginLeft: '6px' }}>({c.name})</span>
                              <span style={{ color: '#9ca3af', marginLeft: '6px', fontSize: '11px' }}>{formatPhoneNumber(c.phone)}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {nickCheckStatus === 'ok' && similarNicknames.length > 0 && (
                    <div style={{ marginTop: '8px', padding: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
                      <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700, margin: '0 0 6px 0' }}>
                        ✅ 사용 가능한 닉네임입니다. 유사한 닉네임이 있습니다:
                      </p>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {similarNicknames.map(c => (
                          <li key={c.customer_id} style={{ display: 'flex', padding: '6px 8px', background: '#ffffff', borderRadius: '4px', border: '1px solid #e5e7eb', fontSize: '12px' }}>
                            <div>
                              <span style={{ fontWeight: 700, color: '#151c27' }}>{c.nickname || '-'}</span>
                              <span style={{ color: '#6b7280', marginLeft: '6px' }}>({c.name})</span>
                              <span style={{ color: '#9ca3af', marginLeft: '6px', fontSize: '11px' }}>{formatPhoneNumber(c.phone)}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {nickCheckStatus === 'ok' && similarNicknames.length === 0 && (
                    <p style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px', fontWeight: 600 }}>✅ 사용 가능한 닉네임입니다.</p>
                  )}
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

      {/* 중복 회원 정리 모달 */}
      {isMergeModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMergeModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '750px', maxWidth: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3 className="modal-title">🔍 중복 회원 정리</h3>
              <button
                onClick={() => setIsMergeModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                닉네임이 정확히 일치하거나 유사하여 중복으로 의심되는 회원 그룹들입니다.<br />
                각 그룹에서 <strong>유지할 대표 회원</strong>을 1명 선택하고, <strong>병합하여 삭제할 회원들</strong>을 체크한 뒤 합치기를 진행해 주세요.
              </p>

              {duplicateGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  🎉 분석 결과, 중복이 의심되는 회원이 없습니다!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {duplicateGroups.map((group) => {
                    const mainId = selectedMainIds[group.id];
                    const mergeIds = selectedMergeIds[group.id] || [];

                    return (
                      <div key={group.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', background: '#f9fafb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: '#006688' }}>
                            그룹: {group.representativeName} (매칭 회원: {group.members.length}명)
                          </span>
                          <button
                            className="btn btn-primary"
                            onClick={() => handleExecuteMerge(group.id)}
                            disabled={isMerging || mergeIds.length === 0}
                            style={{ padding: '6px 12px', fontSize: '12px', background: '#7c3aed', borderColor: '#7c3aed', cursor: 'pointer' }}
                          >
                            {isMerging ? '병합 중...' : '이 그룹 합치기'}
                          </button>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                          <table className="custom-table" style={{ fontSize: '12px', background: '#ffffff', minWidth: '550px' }}>
                            <thead>
                              <tr>
                                <th style={{ width: '80px', textAlign: 'center' }}>유지 (대표)</th>
                                <th style={{ width: '80px', textAlign: 'center' }}>병합 (삭제)</th>
                                <th>ID</th>
                                <th>닉네임</th>
                                <th>고객명</th>
                                <th>연락처</th>
                                <th style={{ textAlign: 'center' }}>주문횟수</th>
                                <th>최근주문일</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.members.map((member) => {
                                const isMain = mainId === member.customer_id;
                                const isCheckedForMerge = mergeIds.includes(member.customer_id);

                                return (
                                  <tr key={member.customer_id} style={{ background: isMain ? '#f0fdf4' : isCheckedForMerge ? '#fef2f2' : 'inherit' }}>
                                    <td style={{ textAlign: 'center' }}>
                                      <input
                                        type="radio"
                                        name={`main_${group.id}`}
                                        checked={isMain}
                                        onChange={() => {
                                          setSelectedMainIds({
                                            ...selectedMainIds,
                                            [group.id]: member.customer_id
                                          });
                                          const nextMerges = group.members
                                            .filter(m => m.customer_id !== member.customer_id)
                                            .map(m => m.customer_id);
                                          setSelectedMergeIds({
                                            ...selectedMergeIds,
                                            [group.id]: nextMerges
                                          });
                                        }}
                                        style={{ cursor: 'pointer' }}
                                      />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      <input
                                        type="checkbox"
                                        checked={isCheckedForMerge}
                                        disabled={isMain}
                                        onChange={(e) => {
                                          let nextMerges = [...mergeIds];
                                          if (e.target.checked) {
                                            if (!nextMerges.includes(member.customer_id)) {
                                              nextMerges.push(member.customer_id);
                                            }
                                          } else {
                                            nextMerges = nextMerges.filter(id => id !== member.customer_id);
                                          }
                                          setSelectedMergeIds({
                                            ...selectedMergeIds,
                                            [group.id]: nextMerges
                                          });
                                        }}
                                        style={{ cursor: isMain ? 'not-allowed' : 'pointer' }}
                                      />
                                    </td>
                                    <td>{member.customer_id}</td>
                                    <td style={{ fontWeight: 'bold' }}>{member.nickname || '-'}</td>
                                    <td>{member.name}</td>
                                    <td>{formatPhoneNumber(member.phone)}</td>
                                    <td style={{ textAlign: 'center' }}>{member.order_count}</td>
                                    <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                      {member.last_order_date ? new Date(member.last_order_date).toLocaleDateString() : '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsMergeModalOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
