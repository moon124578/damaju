import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { matchChosung } from '../hangulSearch';

export default function Orders({ onDataChange }) {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [staffs, setStaffs] = useState([]);
  const [loading, setLoading] = useState(true);

  // 검색어 상태
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [filterStaff, setFilterStaff] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // 정렬 상태
  const [sortConfig, setSortConfig] = useState({ key: 'order_date', direction: 'desc' });

  // 체크박스 선택 상태 (배송 전 일괄 처리용)
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  // 주문 수정 모달 상태
  const [editingOrder, setEditingOrder] = useState(null);
  const [editProduct, setEditProduct] = useState('');
  const [editQty, setEditQty] = useState(1);
  const [editUnitPrice, setEditUnitPrice] = useState(0);
  const [editStaffId, setEditStaffId] = useState('');
  const [editStatus, setEditStatus] = useState('');


  const [custQuery, setCustQuery] = useState('');
  const [custSuggestions, setCustSuggestions] = useState([]);
  const [activeCustIdx, setActiveCustIdx] = useState(-1);
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // 다중 상품 입력 행 (orderLines)
  const DEFAULT_PRODUCTS = ['0.3', '0.5', '0.7', '0.8', '1.0'];
  const makeDefaultLines = () => DEFAULT_PRODUCTS.map(name => ({ productName: name, quantity: 0 }));
  const [orderLines, setOrderLines] = useState(makeDefaultLines);
  const [showOrderLines, setShowOrderLines] = useState(false);
  const [activeLineDropdown, setActiveLineDropdown] = useState(-1); // 어떤 행의 상품 드롭다운이 열려있는지

  const [orderStaffId, setOrderStaffId] = useState(() => {
    return localStorage.getItem('last_selected_staff_id') || '';
  });

  // 2. 장바구니 상태
  const [cartItems, setCartItems] = useState([]);

  const todayStr = new Date().toISOString().substring(0, 10);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // 1. 고객 목록 로드
      const { data: custData } = await supabase
        .from('customers')
        .select('customer_id, nickname, name, phone, address')
        .order('customer_id', { ascending: true });
      setCustomers(custData || []);

      // 2. 상품 목록 로드
      const { data: prodData } = await supabase
        .from('products')
        .select('id, name, selling_price')
        .order('name', { ascending: true });
      setProducts(prodData || []);

      // 3. 직원 목록 로드
      const { data: staffData } = await supabase
        .from('staffs')
        .select('staff_id, staff_name')
        .order('staff_id', { ascending: true });
      setStaffs(staffData || []);
      if (staffData && staffData.length > 0) {
        const savedStaffId = localStorage.getItem('last_selected_staff_id');
        const exists = staffData.some(s => s.staff_id.toString() === savedStaffId);
        if (savedStaffId && exists) {
          setOrderStaffId(savedStaffId);
        } else {
          setOrderStaffId(staffData[0].staff_id.toString());
          localStorage.setItem('last_selected_staff_id', staffData[0].staff_id.toString());
        }
      }

      // 4. 주문 목록 로드
      await fetchOrders();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async (searchVal = orderSearchQuery) => {
    try {
      let query = supabase
        .from('orders')
        .select(`
          order_id, customer_id, product_name, quantity, unit_price, total_price, order_date, order_status, refund_date,
          customers (nickname, name, phone, address), staffs (staff_name, staff_id)
        `);

      if (searchVal.trim()) {
        // 상품명 또는 고객 닉네임/이름에 대해 검색 필터링
        // 단순하게 우선 전체 가져와서 클라이언트 필터를 사용하거나, ilike를 사용합니다.
        // 여기서는 or 조건이 테이블 조인(customers) 필드에 대해 supabase-js로 직접 or 쿼리가 번거로우므로,
        // API 결과를 받아서 클라이언트 측 필터를 적용하도록 구현하거나, query searchVal을 적용합니다.
      }

      const { data, error } = await query.order('order_id', { ascending: false });
      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  };

  // 고객 검색 자동완성 핸들러
  const handleCustChange = (e) => {
    const val = e.target.value;
    setCustQuery(val);
    setSelectedCustomer(null);
    if (val.trim()) {
      const matches = customers.filter((c) =>
        matchChosung(c.name, val) ||
        (c.nickname && matchChosung(c.nickname, val))
      );
      setCustSuggestions(matches);
      setShowCustDropdown(true);
      setActiveCustIdx(-1);
    } else {
      setCustSuggestions([]);
      setShowCustDropdown(false);
    }
  };

  const handleCustKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveCustIdx((prev) => Math.min(prev + 1, custSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveCustIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeCustIdx >= 0 && activeCustIdx < custSuggestions.length) {
        selectCust(custSuggestions[activeCustIdx]);
      }
    } else if (e.key === 'Escape') {
      setShowCustDropdown(false);
    }
  };

  const selectCust = (cust) => {
    setSelectedCustomer(cust);
    // 닉네임과 이름이 다르면 함께 표시하여 동일 닉네임 고객 구분
    const displayName = cust.nickname
      ? (cust.nickname !== cust.name ? `[${cust.nickname}] ${cust.name}` : cust.nickname)
      : cust.name;
    setCustQuery(displayName);
    setShowCustDropdown(false);
    // 고객 선택 시 상품 행 표시
    if (!showOrderLines) {
      setShowOrderLines(true);
      setOrderLines(makeDefaultLines());
    }
  };

  // 상품 행 추가
  const handleAddLine = () => {
    setOrderLines([...orderLines, { productName: '', quantity: 0 }]);
  };

  // 상품 행 삭제
  const handleRemoveLine = (index) => {
    if (orderLines.length <= 1) return;
    setOrderLines(orderLines.filter((_, i) => i !== index));
  };

  // 상품 행 값 변경
  const handleLineChange = (index, field, value) => {
    const newLines = [...orderLines];
    newLines[index] = { ...newLines[index], [field]: value };
    setOrderLines(newLines);
  };

  // 장바구니 담기 (주문 추가) - 다중 상품 일괄 추가
  const handleAddToCart = (e) => {
    e.preventDefault();
    if (!custQuery.trim()) {
      alert('고객 닉네임을 입력해주세요.');
      return;
    }

    // 고객정보 유효성 검증 — 드롭다운에서 선택한 고객이 있으면 우선 사용
    const typedQuery = custQuery.trim();
    let matchCust = selectedCustomer;
    if (!matchCust) {
      const matchedList = customers.filter(c => c.nickname === typedQuery || c.name === typedQuery);
      if (matchedList.length > 1) {
        alert(`동일한 닉네임/이름을 가진 고객이 ${matchedList.length}명 존재합니다. 검색 결과 드롭다운에서 구분하여 클릭해 주세요.`);
        return;
      }
      matchCust = matchedList[0];

      if (!matchCust && typedQuery.startsWith('[') && typedQuery.includes(']')) {
        const closingBracketIdx = typedQuery.indexOf(']');
        const parsedNickname = typedQuery.substring(1, closingBracketIdx).trim();
        const matchedListBrackets = customers.filter(c => c.nickname === parsedNickname);
        if (matchedListBrackets.length > 1) {
          alert(`동일한 닉네임/이름을 가진 고객이 ${matchedListBrackets.length}명 존재합니다. 검색 결과 드롭다운에서 구분하여 클릭해 주세요.`);
          return;
        }
        matchCust = matchedListBrackets[0];
      }
    }
    if (!matchCust) {
      alert('회원정보(고객)에 존재하지 않는 닉네임/이름입니다. 회원정보 탭에서 먼저 고객을 등록해주세요.');
      return;
    }

    // 수량이 0보다 큰 행만 필터링
    const validLines = orderLines.filter(line => line.quantity > 0 && line.productName.trim());
    if (validLines.length === 0) {
      alert('수량이 1개 이상인 상품이 없습니다. 수량을 입력해주세요.');
      return;
    }

    const staffId = orderStaffId ? Number(orderStaffId) : null;
    const newItems = [];

    for (const line of validLines) {
      // 상품정보 유효성 검증
      const matchProd = products.find(p => p.name === line.productName.trim());
      if (!matchProd) {
        alert(`상품관리에 등록되지 않은 상품명입니다: ${line.productName}`);
        return;
      }
      const unitPrice = matchProd.selling_price;
      newItems.push({
        id: Date.now() + Math.random(),
        customerId: matchCust.customer_id,
        custDisplayName: matchCust.nickname
          ? (matchCust.nickname !== matchCust.name ? `[${matchCust.nickname}] ${matchCust.name}` : matchCust.nickname)
          : matchCust.name,
        prodQuery: line.productName.trim(),
        selectedProduct: matchProd,
        quantity: Number(line.quantity),
        unitPrice,
        totalPrice: unitPrice * Number(line.quantity),
        staffId,
      });
    }

    setCartItems([...cartItems, ...newItems]);

    // 상품 행 초기화 (고객 정보 유지)
    setOrderLines(makeDefaultLines());
  };

  // 즉시 최종 주문 접수 실행 (장바구니를 거치지 않고 바로 DB 저장)
  const handleDirectSubmitOrders = async () => {
    if (!custQuery.trim()) {
      alert('고객 닉네임을 입력해주세요.');
      return;
    }

    // 고객정보 유효성 검증 — 드롭다운에서 선택한 고객이 있으면 우선 사용
    const typedQuery = custQuery.trim();
    let matchCust = selectedCustomer;
    if (!matchCust) {
      const matchedList = customers.filter(c => c.nickname === typedQuery || c.name === typedQuery);
      if (matchedList.length > 1) {
        alert(`동일한 닉네임/이름을 가진 고객이 ${matchedList.length}명 존재합니다. 검색 결과 드롭다운에서 구분하여 클릭해 주세요.`);
        return;
      }
      matchCust = matchedList[0];

      if (!matchCust && typedQuery.startsWith('[') && typedQuery.includes(']')) {
        const closingBracketIdx = typedQuery.indexOf(']');
        const parsedNickname = typedQuery.substring(1, closingBracketIdx).trim();
        const matchedListBrackets = customers.filter(c => c.nickname === parsedNickname);
        if (matchedListBrackets.length > 1) {
          alert(`동일한 닉네임/이름을 가진 고객이 ${matchedListBrackets.length}명 존재합니다. 검색 결과 드롭다운에서 구분하여 클릭해 주세요.`);
          return;
        }
        matchCust = matchedListBrackets[0];
      }
    }
    if (!matchCust) {
      alert('회원정보(고객)에 존재하지 않는 닉네임/이름입니다. 회원정보 탭에서 먼저 고객을 등록해주세요.');
      return;
    }

    // 수량이 0보다 큰 행만 필터링
    const validLines = orderLines.filter(line => line.quantity > 0 && line.productName.trim());
    if (validLines.length === 0) {
      alert('수량이 1개 이상인 상품이 없습니다. 수량을 입력해주세요.');
      return;
    }

    const staffId = orderStaffId ? Number(orderStaffId) : null;
    const itemsToSubmit = [];

    for (const line of validLines) {
      // 상품정보 유효성 검증
      const matchProd = products.find(p => p.name === line.productName.trim());
      if (!matchProd) {
        alert(`상품관리에 등록되지 않은 상품명입니다: ${line.productName}`);
        return;
      }
      const unitPrice = matchProd.selling_price;
      itemsToSubmit.push({
        custId: matchCust.customer_id,
        prodQuery: line.productName.trim(),
        quantity: Number(line.quantity),
        unitPrice,
        totalPrice: unitPrice * Number(line.quantity),
        staffId,
      });
    }

    if (!window.confirm(`입력한 ${itemsToSubmit.length}건의 주문을 즉시 최종 접수하시겠습니까?`)) {
      return;
    }

    setLoading(true);
    try {
      for (const item of itemsToSubmit) {
        const { error: ordErr } = await supabase
          .from('orders')
          .insert({
            customer_id: item.custId,
            product_name: item.prodQuery,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
            staff_id: item.staffId,
            order_status: '배송 전',
          });

        if (ordErr) throw ordErr;
      }

      // 입력 폼 초기화
      setOrderLines(makeDefaultLines());
      setCustQuery('');
      setSelectedCustomer(null);

      await fetchOrders();
      onDataChange();
      alert('주문이 모두 접수되었습니다. (초기 상태: 배송 전)');
    } catch (err) {
      console.error(err);
      alert('주문 등록 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 장바구니 항목 삭제
  const handleRemoveFromCart = (id) => {
    setCartItems(cartItems.filter(item => item.id !== id));
  };

  // 최종 주문 접수 실행
  const handleSubmitOrders = async () => {
    if (cartItems.length === 0) {
      alert('주문 추가 버튼을 눌러 장바구니에 상품을 담아주세요.');
      return;
    }

    setLoading(true);
    try {
      for (const item of cartItems) {
        const custId = item.customerId;
        if (!custId) {
          throw new Error(`고객 정보를 찾을 수 없습니다: ${item.custDisplayName}`);
        }

        const { error: ordErr } = await supabase
          .from('orders')
          .insert({
            customer_id: custId,
            product_name: item.prodQuery,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
            staff_id: item.staffId,
            order_status: '배송 전',
          });

        if (ordErr) throw ordErr;
      }

      setCartItems([]);
      setCustQuery('');
      setSelectedCustomer(null);

      await fetchOrders();
      onDataChange();
      alert('주문이 모두 접수되었습니다. (초기 상태: 배송 전)');
    } catch (err) {
      console.error(err);
      alert('주문 등록 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      const updateData = { order_status: newStatus };
      if (newStatus === '환불 완료') {
        updateData.refund_date = new Date().toISOString();
      }
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('order_id', orderId);
      if (error) throw error;
      await fetchOrders();
      onDataChange();
    } catch (err) {
      console.error('Error updating status:', err);
      alert('상태 변경 실패');
    }
  };

  const handleUpdateOrder = async (e) => {
    e.preventDefault();
    if (!editingOrder) return;
    setLoading(true);
    try {
      const totalPrice = Number(editQty) * Number(editUnitPrice);
      const updateData = {
        product_name: editProduct,
        quantity: Number(editQty),
        unit_price: Number(editUnitPrice),
        total_price: totalPrice,
        staff_id: editStaffId ? Number(editStaffId) : null,
        order_status: editStatus
      };
      if (editStatus === '환불 완료' && editingOrder.order_status !== '환불 완료') {
        updateData.refund_date = new Date().toISOString();
      }
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('order_id', editingOrder.order_id);

      if (error) throw error;
      setEditingOrder(null);
      await fetchOrders();
      onDataChange();
      alert('주문 정보가 수정되었습니다.');
    } catch (err) {
      console.error('Error updating order:', err);
      alert('주문 수정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrderDirect = async () => {
    if (!editingOrder) return;
    if (!window.confirm('이 주문을 취소하시겠습니까?')) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_status: '주문 취소' })
        .eq('order_id', editingOrder.order_id);

      if (error) throw error;
      setEditingOrder(null);
      await fetchOrders();
      onDataChange();
      alert('주문이 취소되었습니다.');
    } catch (err) {
      console.error('Error cancelling order:', err);
      alert('주문 취소 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefundOrderDirect = async () => {
    if (!editingOrder) return;
    if (!window.confirm('이 주문을 환불 처리하시겠습니까?')) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          order_status: '환불 완료',
          refund_date: new Date().toISOString()
        })
        .eq('order_id', editingOrder.order_id);

      if (error) throw error;
      setEditingOrder(null);
      await fetchOrders();
      onDataChange();
      alert('환불 처리가 완료되었습니다.');
    } catch (err) {
      console.error('Error refunding order:', err);
      alert('환불 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!editingOrder) return;
    if (!window.confirm(`주문번호 ${editingOrder.order_id}번을 완전히 삭제하시겠습니까?\n삭제하면 복구할 수 없습니다.`)) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('order_id', editingOrder.order_id);
      if (error) throw error;
      setEditingOrder(null);
      await fetchOrders();
      onDataChange();
      alert('주문이 삭제되었습니다.');
    } catch (err) {
      console.error('Error deleting order:', err);
      alert('주문 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkComplete = async () => {
    if (selectedOrderIds.length === 0) return;
    if (!window.confirm(`선택한 ${selectedOrderIds.length}건의 주문을 입금 완료 처리하시겠습니까?`)) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_status: '입금 완료' })
        .in('order_id', selectedOrderIds);
      if (error) throw error;
      setSelectedOrderIds([]);
      await fetchOrders();
      onDataChange();
      alert('일괄 입금 완료 처리되었습니다.');
    } catch (err) {
      console.error('Error bulk updating status:', err);
      alert('일괄 입금 완료 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkCompleteIssuedReceipts = async () => {
    const issuedOrders = orders.filter(o => o.order_status === '정산서 발행');
    if (issuedOrders.length === 0) {
      alert('입금 완료 처리할 "정산서 발행" 상태의 주문 건이 없습니다.');
      return;
    }

    // 1단계 확인 안전장치
    if (!window.confirm(`[안전장치 1단계] "정산서 발행" 상태인 주문 ${issuedOrders.length}건 전체를 "입금 완료"로 변경하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }
    // 2단계 확인 안전장치
    if (!window.confirm(`[안전장치 2단계 - 최종 확인] 정말로 진행하시겠습니까? 실제 입금 처리가 완료되었는지 다시 한 번 확인해 주시기 바랍니다.`)) {
      return;
    }

    setLoading(true);
    try {
      const orderIds = issuedOrders.map(o => o.order_id);
      const { error } = await supabase
        .from('orders')
        .update({ order_status: '입금 완료' })
        .in('order_id', orderIds);
      if (error) throw error;

      await fetchOrders();
      onDataChange();
      alert('정산서 발행 건들의 일괄 입금 완료 처리가 성공적으로 완료되었습니다.');
    } catch (err) {
      console.error('Error updating issued orders to completed:', err);
      alert('일괄 입금 완료 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const todayOrders = orders.filter(o => o.order_date?.substring(0, 10) === todayStr);

  // 검색어 및 담당자/상태 필터로 필터링된 주문 목록
  const filteredOrders = orders.filter((o) => {
    // 1. 담당자 필터
    if (filterStaff !== 'all' && o.staffs?.staff_id !== Number(filterStaff)) {
      return false;
    }
    // 2. 상태 필터
    if (filterStatus !== 'all' && o.order_status !== filterStatus) {
      return false;
    }
    // 3. 검색어 필터
    // 3. 검색어 필터 (초성 검색 지원)
    if (!orderSearchQuery.trim()) return true;
    const q = orderSearchQuery;
    return (
      (o.customers?.nickname && matchChosung(o.customers.nickname, q)) ||
      (o.customers?.name && matchChosung(o.customers.name, q)) ||
      (o.product_name && matchChosung(o.product_name, q)) ||
      (o.staffs?.staff_name && matchChosung(o.staffs.staff_name, q))
    );
  });

  // 정렬 적용된 주문 목록
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    let aVal, bVal;
    if (sortConfig.key === 'order_date') {
      aVal = a.order_date ? new Date(a.order_date).getTime() : 0;
      bVal = b.order_date ? new Date(b.order_date).getTime() : 0;
    } else if (sortConfig.key === 'customer_name') {
      aVal = a.customers?.nickname || a.customers?.name || '';
      bVal = b.customers?.nickname || b.customers?.name || '';
    } else if (sortConfig.key === 'staff_name') {
      aVal = a.staffs?.staff_name || '';
      bVal = b.staffs?.staff_name || '';
    }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div style={{ fontFamily: "'Hanken Grotesk', 'Malgun Gothic', sans-serif", height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 페이지 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", color: '#6d7980', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
            Live Commerce / Orders
          </p>
          <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#151c27', margin: 0, letterSpacing: '-0.01em' }}>주문 관리</h2>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", padding: '4px 12px', background: '#e7eefe', borderRadius: '999px', color: '#006688', fontWeight: 500 }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#006688', display: 'inline-block' }} />
            LIVE STATUS: ACTIVE
          </span>
        </div>
      </div>

      <div className="grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '16px', flex: 1, minHeight: 0 }}>
        
        {/* 전체 너비 활용: 주문 등록 폼 및 로그 */}
        <div style={{ gridColumn: 'span 12', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
          
          {/* 수동 주문 등록 섹션 */}
          <div style={{ background: '#ffffff', border: '1px solid #bcc8d1', borderRadius: '8px', padding: '24px' }}>
            <h4 style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", color: '#6d7980', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#006688' }}>add_shopping_cart</span>
              주문 등록
            </h4>
            
            <form onSubmit={handleAddToCart} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* 상단: 고객 닉네임 + 담당 직원 */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {/* 고객 닉네임 입력 */}
                <div style={{ flex: 2, minWidth: '160px', position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#6d7980', marginBottom: '4px', fontFamily: "'JetBrains Mono', monospace" }}>고객 닉네임 입력</label>
                  <input
                    type="text"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '14px', fontFamily: "'Hanken Grotesk', sans-serif", outline: 'none', background: '#ffffff' }}
                    placeholder="예: 바리"
                    value={custQuery}
                    onChange={handleCustChange}
                    onKeyDown={handleCustKeyDown}
                    onFocus={() => setShowCustDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCustDropdown(false), 200)}
                    required
                    autoComplete="off"
                  />
                  {showCustDropdown && custSuggestions.length > 0 && (
                    <div className="autocomplete-dropdown" style={{ width: '100%' }}>
                      <div style={{ padding: '6px 12px', borderBottom: '1px solid #bcc8d1', background: '#f0f3ff', fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", color: '#6d7980' }}>검색 결과</div>
                      {custSuggestions.map((cust, idx) => (
                        <div
                          key={cust.customer_id}
                          className={`suggestion-item ${idx === activeCustIdx ? 'active' : ''}`}
                          onMouseDown={() => selectCust(cust)}
                          style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}
                        >
                          <span style={{ fontWeight: 500 }}>{cust.nickname ? `[${cust.nickname}] ` : ''}{cust.name}</span>
                          <span style={{ fontSize: '11px', color: '#6d7980' }}>{cust.phone?.slice(-4) || 'CRM'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 담당 직원 */}
                <div style={{ width: '120px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#6d7980', marginBottom: '4px', fontFamily: "'JetBrains Mono', monospace" }}>담당 직원</label>
                  <select
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '14px', fontFamily: "'Hanken Grotesk', sans-serif", outline: 'none', background: '#ffffff' }}
                    value={orderStaffId}
                    onChange={(e) => {
                      setOrderStaffId(e.target.value);
                      localStorage.setItem('last_selected_staff_id', e.target.value);
                    }}
                  >
                    {staffs.map(s => (
                      <option key={s.staff_id} value={s.staff_id.toString()}>{s.staff_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 다중 상품 입력 행 */}
              {(showOrderLines || custQuery.trim()) && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>품목별 수량 입력 (수량 0 = 제외)</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={handleAddLine}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '4px 10px', background: '#006688', color: '#ffffff',
                          border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
                        행 추가
                      </button>
                      <button
                        type="button"
                        onClick={handleDirectSubmitOrders}
                        disabled={loading}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '4px 10px', background: '#006b5c', color: '#ffffff',
                          border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                          cursor: 'pointer', opacity: loading ? 0.7 : 1
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span>
                        최종 주문 접수
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {orderLines.map((line, idx) => {
                      const matchProd = products.find(p => p.name === line.productName);
                      const lineTotal = matchProd ? matchProd.selling_price * line.quantity : 0;
                      return (
                        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {/* 상품명 + 초성 자동완성 */}
                          <div style={{ position: 'relative', flex: 2 }}>
                            <input
                              type="text"
                              value={line.productName}
                              onChange={(e) => handleLineChange(idx, 'productName', e.target.value)}
                              onFocus={() => setActiveLineDropdown(idx)}
                              onBlur={() => setTimeout(() => setActiveLineDropdown(-1), 200)}
                              placeholder="상품명"
                              autoComplete="off"
                              style={{
                                width: '100%', padding: '7px 10px', border: '1px solid #bcc8d1',
                                borderRadius: '6px', fontSize: '13px', outline: 'none', background: '#ffffff',
                                fontWeight: matchProd ? 600 : 400,
                                color: matchProd ? '#151c27' : '#94a3b8',
                                boxSizing: 'border-box'
                              }}
                            />
                            {activeLineDropdown === idx && line.productName.trim() && (() => {
                              const suggestions = products.filter(p => matchChosung(p.name, line.productName.trim()));
                              if (suggestions.length === 0 || (suggestions.length === 1 && suggestions[0].name === line.productName)) return null;
                              return (
                                <div style={{
                                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                                  background: '#ffffff', border: '1px solid #bcc8d1', borderRadius: '6px',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '160px', overflowY: 'auto'
                                }}>
                                  {suggestions.map(prod => (
                                    <div
                                      key={prod.id}
                                      onMouseDown={() => {
                                        handleLineChange(idx, 'productName', prod.name);
                                        setActiveLineDropdown(-1);
                                      }}
                                      style={{
                                        padding: '6px 10px', cursor: 'pointer', fontSize: '12px',
                                        display: 'flex', justifyContent: 'space-between',
                                        borderBottom: '1px solid #f1f5f9'
                                      }}
                                    >
                                      <span style={{ fontWeight: 600 }}>{prod.name}</span>
                                      <span style={{ color: '#6d7980', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>₩{prod.selling_price.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                          {/* 수량 */}
                          <div style={{ width: '80px' }}>
                            <input
                              type="number"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(idx, 'quantity', Math.max(0, parseInt(e.target.value, 10) || 0))}
                              min="0"
                              style={{
                                width: '100%', padding: '7px 10px', border: '1px solid #bcc8d1',
                                borderRadius: '6px', fontSize: '13px', fontFamily: "'JetBrains Mono', monospace",
                                outline: 'none', background: line.quantity > 0 ? '#f0fff4' : '#ffffff',
                                textAlign: 'center', fontWeight: 700,
                                color: line.quantity > 0 ? '#006b5c' : '#94a3b8',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                          {/* 금액 표시 */}
                          <span style={{
                            width: '80px', textAlign: 'right', fontSize: '12px',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: 600, color: lineTotal > 0 ? '#006b5c' : '#cbd5e1'
                          }}>
                            ₩{lineTotal.toLocaleString()}
                          </span>
                          {/* 삭제 버튼 */}
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={orderLines.length <= 1}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: '28px', height: '28px', padding: 0,
                              background: orderLines.length <= 1 ? '#f1f5f9' : '#fff1f2',
                              color: orderLines.length <= 1 ? '#cbd5e1' : '#dc2626',
                              border: 'none', borderRadius: '6px', cursor: orderLines.length <= 1 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>remove</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {/* 합계 + 주문 추가 버튼 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      선택 품목: <strong style={{ color: '#006b5c' }}>{orderLines.filter(l => l.quantity > 0).length}건</strong>
                      {' / '}
                      합계: <strong style={{ color: '#006688', fontFamily: "'JetBrains Mono', monospace" }}>
                        ₩{orderLines.reduce((sum, line) => {
                          const p = products.find(pr => pr.name === line.productName);
                          return sum + (p ? p.selling_price * line.quantity : 0);
                        }, 0).toLocaleString()}
                      </strong>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        padding: '9px 16px', background: '#f0f3ff', color: '#006688', border: '1px solid #006688',
                        borderRadius: '999px', fontSize: '13px', fontWeight: 600,
                        fontFamily: "'Hanken Grotesk', sans-serif", cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                        opacity: loading ? 0.7 : 1,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
                      장바구니 담기
                    </button>
                  </div>
                </div>
              )}
            </form>

            {/* 장바구니(카트) UI */}
            {cartItems.length > 0 && (
              <div style={{ marginTop: '24px', background: '#f9f9ff', border: '1px solid #bcc8d1', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h5 style={{ fontSize: '13px', color: '#151c27', margin: 0, fontWeight: 600 }}>주문 대기 목록 (장바구니)</h5>
                  <button
                    onClick={handleSubmitOrders}
                    disabled={loading}
                    style={{
                      padding: '8px 16px', background: '#006b5c', color: '#ffffff', border: 'none',
                      borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
                      opacity: loading ? 0.7 : 1
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
                    최종 주문 접수 ({cartItems.length}건)
                  </button>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {cartItems.map((item, idx) => (
                    <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#ffffff', border: '1px solid #e2e8f8', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#6d7980', fontFamily: "'JetBrains Mono', monospace", width: '20px' }}>{idx + 1}</span>
                        <span style={{ fontWeight: 600, color: '#006688', minWidth: '80px' }}>{item.custDisplayName}</span>
                        <span style={{ color: '#3d484f' }}>{item.prodQuery} <span style={{ fontWeight: 600 }}>({item.quantity}개)</span></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>₩{item.totalPrice.toLocaleString()}</span>
                        <button onClick={() => handleRemoveFromCart(item.id)} style={{ background: 'none', border: 'none', color: '#ba1a1a', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 최근 주문 로그 및 검색 필터 */}
          <div style={{ background: '#ffffff', border: '1px solid #bcc8d1', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #bcc8d1', background: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h4 style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", color: '#6d7980', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>주문 내역</h4>
                
                {/* 텍스트 검색기 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0f3ff', border: '1px solid #bcc8d1', borderRadius: '6px', padding: '2px 8px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#6d7980' }}>search</span>
                  <input
                    type="text"
                    placeholder="주문 검색 (고객명, 상품명, 담당자...)"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    style={{ border: 'none', background: 'transparent', fontSize: '12px', outline: 'none', width: '200px', fontFamily: "'Hanken Grotesk', sans-serif" }}
                  />
                </div>

                {/* 담당자 필터 */}
                <select
                  value={filterStaff}
                  onChange={(e) => setFilterStaff(e.target.value)}
                  style={{ padding: '4px 10px', border: '1px solid #bcc8d1', borderRadius: '6px', fontSize: '12px', outline: 'none', background: '#ffffff', fontFamily: "'Hanken Grotesk', sans-serif" }}
                >
                  <option value="all">전체 담당자</option>
                  {staffs.map(s => (
                    <option key={s.staff_id} value={s.staff_id.toString()}>{s.staff_name}</option>
                  ))}
                </select>

                {/* 상태 필터 */}
                <select
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setSelectedOrderIds([]); // 필터 변경 시 선택 초기화
                  }}
                  style={{ padding: '4px 10px', border: '1px solid #bcc8d1', borderRadius: '6px', fontSize: '12px', outline: 'none', background: '#ffffff', fontFamily: "'Hanken Grotesk', sans-serif" }}
                >
                  <option value="all">전체 상태</option>
                  <option value="배송 전">배송 전</option>
                  <option value="정산서 발행">정산서 발행</option>
                  <option value="입금 완료">입금 완료</option>
                  <option value="배송 완료">배송 완료</option>
                  <option value="주문 취소">주문 취소</option>
                  <option value="환불 완료">환불 완료</option>
                </select>

                {/* 일괄 입금 완료 버튼 */}
                {filterStatus === '배송 전' && (
                  <button
                    onClick={handleBulkComplete}
                    disabled={selectedOrderIds.length === 0}
                    style={{
                      padding: '4px 12px',
                      background: selectedOrderIds.length === 0 ? '#cccccc' : '#006b5c',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: selectedOrderIds.length === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontFamily: "'Hanken Grotesk', sans-serif"
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>payments</span>
                    일괄 입금완료 ({selectedOrderIds.length})
                  </button>
                )}

                {/* 정산서 발행 -> 입금 완료 일괄 처리 버튼 */}
                <button
                  onClick={handleBulkCompleteIssuedReceipts}
                  disabled={loading}
                  style={{
                    padding: '4px 12px',
                    background: '#e65100',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontFamily: "'Hanken Grotesk', sans-serif",
                    boxShadow: '0 2px 4px rgba(230, 81, 0, 0.15)'
                  }}
                  title="정산서 발행 상태의 모든 주문 건을 입금 완료 상태로 변경합니다"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>task_alt</span>
                  정산서발행 일괄 입금완료
                </button>
              </div>
              {filterStatus === '환불 완료' ? (
                <span style={{ fontSize: '11px', color: '#ba1a1a', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                  환불 {sortedOrders.length}건 | 총 ₩{sortedOrders.reduce((sum, o) => sum + (o.total_price || 0), 0).toLocaleString()}
                </span>
              ) : (
                <span style={{ fontSize: '11px', color: '#6d7980', fontFamily: "'JetBrains Mono', monospace" }}>Today: {todayOrders.length} Orders</span>
              )}
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table className="stitch-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: filterStatus === '환불 완료' ? '#fff5f5' : '#f0f3ff' }}>
                    {filterStatus === '배송 전' && (
                      <th style={{ padding: '12px 16px', fontSize: '12px', color: '#3d484f', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', textAlign: 'center', width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={sortedOrders.length > 0 && selectedOrderIds.length === sortedOrders.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedOrderIds(sortedOrders.map(o => o.order_id));
                            } else {
                              setSelectedOrderIds([]);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                    )}
                    <th 
                      onClick={() => requestSort('order_date')}
                      style={{ padding: '12px 24px', fontSize: '12px', color: '#3d484f', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        주문일자
                        <span className="material-symbols-outlined" style={{ fontSize: '14px', color: sortConfig.key === 'order_date' ? '#006688' : '#bcc8d1' }}>
                          {sortConfig.key === 'order_date' ? (sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                        </span>
                      </div>
                    </th>
                    <th 
                      onClick={() => requestSort('customer_name')}
                      style={{ padding: '12px 24px', fontSize: '12px', color: '#3d484f', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        고객명
                        <span className="material-symbols-outlined" style={{ fontSize: '14px', color: sortConfig.key === 'customer_name' ? '#006688' : '#bcc8d1' }}>
                          {sortConfig.key === 'customer_name' ? (sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                        </span>
                      </div>
                    </th>
                    <th style={{ padding: '12px 24px', fontSize: '12px', color: '#3d484f', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace' }}>상품</th>
                    <th style={{ padding: '12px 24px', fontSize: '12px', color: '#3d484f', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', textAlign: 'center' }}>수량</th>
                    <th 
                      onClick={() => requestSort('staff_name')}
                      style={{ padding: '12px 24px', fontSize: '12px', color: '#3d484f', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        담당자
                        <span className="material-symbols-outlined" style={{ fontSize: '14px', color: sortConfig.key === 'staff_name' ? '#006688' : '#bcc8d1' }}>
                          {sortConfig.key === 'staff_name' ? (sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                        </span>
                      </div>
                    </th>
                    {filterStatus === '환불 완료' && (
                      <th style={{ padding: '12px 24px', fontSize: '12px', color: '#ba1a1a', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>환불일</th>
                    )}
                    {filterStatus !== '환불 완료' && (
                      <th style={{ padding: '12px 24px', fontSize: '12px', color: '#3d484f', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace' }}>상태</th>
                    )}
                    <th style={{ padding: '12px 24px', fontSize: '12px', color: '#3d484f', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={filterStatus === '배송 전' ? "8" : filterStatus === '환불 완료' ? "8" : "7"} style={{ textAlign: 'center', color: '#6d7980', padding: '32px' }}>
                        {filterStatus === '환불 완료' ? '환불 내역이 없습니다.' : '주문 내역이 없습니다.'}
                      </td>
                    </tr>
                  ) : (
                    sortedOrders.map((o) => {
                      const isCancelled = o.order_status === '주문 취소';
                      const isRefunded = o.order_status === '환불 완료';
                      const statusColor = o.order_status === '배송 전' ? '#006688' : o.order_status === '정산서 발행' ? '#e65100' : o.order_status === '입금 완료' ? '#006b5c' : o.order_status === '배송 완료' ? '#0284c7' : '#ba1a1a';
                      return (
                        <tr key={o.order_id} className="stitch-tr" style={{ opacity: isCancelled ? 0.55 : 1, textDecoration: isCancelled ? 'line-through' : 'none', borderBottom: '1px solid #e2e8f8', background: isRefunded && filterStatus === '환불 완료' ? '#fff8f8' : 'transparent' }}>
                          {filterStatus === '배송 전' && (
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={selectedOrderIds.includes(o.order_id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedOrderIds([...selectedOrderIds, o.order_id]);
                                  } else {
                                    setSelectedOrderIds(selectedOrderIds.filter(id => id !== o.order_id));
                                  }
                                }}
                                style={{ cursor: 'pointer' }}
                              />
                            </td>
                          )}
                          <td style={{ padding: '12px 24px', fontFamily: "'JetBrains Mono', monospace", color: '#6d7980', fontSize: '12px' }}>
                            {o.order_date ? new Date(o.order_date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'}
                          </td>
                          <td 
                            style={{ padding: '12px 24px', cursor: 'pointer' }}
                            onClick={() => {
                              setEditingOrder(o);
                              setEditProduct(o.product_name);
                              setEditQty(o.quantity);
                              setEditUnitPrice(o.unit_price);
                              setEditStaffId(o.staffs?.staff_id?.toString() || '');
                              setEditStatus(o.order_status);
                            }}
                            title="클릭 시 주문 정보를 수정합니다"
                          >
                            {o.customers?.nickname && <span style={{ fontSize: '14px', color: '#006688', display: 'block', fontWeight: 700 }}>{o.customers.nickname}</span>}
                            <span style={{ fontSize: '11px', color: '#6d7980' }}>{o.customers?.name || '신규'}</span>
                          </td>
                          <td style={{ padding: '12px 24px', color: '#3d484f' }}>{o.product_name}</td>
                          <td style={{ padding: '12px 24px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" }}>{o.quantity}</td>
                          <td style={{ padding: '12px 24px', color: '#3d484f', fontSize: '13px' }}>
                            {o.staffs?.staff_name || '-'}
                          </td>
                          {filterStatus === '환불 완료' ? (
                            <td style={{ padding: '12px 24px', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#ba1a1a', fontWeight: 600 }}>
                              {o.refund_date
                                ? new Date(o.refund_date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                                : '-'
                              }
                            </td>
                          ) : (
                            <td style={{ padding: '12px 24px' }}>
                              <select
                                value={o.order_status}
                                onChange={(e) => handleStatusChange(o.order_id, e.target.value)}
                                style={{ border: '1px solid #bcc8d1', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontFamily: "'Hanken Grotesk', sans-serif", color: statusColor, background: statusColor + '15', cursor: 'pointer', outline: 'none' }}
                              >
                                <option value="배송 전">배송 전</option>
                                <option value="정산서 발행">정산서 발행</option>
                                <option value="입금 완료">입금 완료</option>
                                <option value="배송 완료">배송 완료</option>
                                <option value="주문 취소">주문 취소</option>
                                <option value="환불 완료">환불 완료</option>
                              </select>
                            </td>
                          )}
                          <td style={{ padding: '12px 24px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                            ₩{o.total_price.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* 주문 수정 모달 */}
      {editingOrder && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 999, backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#ffffff', border: '1px solid #bcc8d1', borderRadius: '12px',
            padding: '24px', width: '90%', maxWidth: '440px', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            display: 'flex', flexDirection: 'column', gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#151c27' }}>주문 정보 수정</h3>
              <button 
                onClick={() => setEditingOrder(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6d7980', display: 'flex', alignItems: 'center', padding: '4px' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            <form onSubmit={handleUpdateOrder} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#6d7980', marginBottom: '4px', fontWeight: 700 }}>고객 (ID/이름)</label>
                <input
                  type="text"
                  value={editingOrder.customers ? `${editingOrder.customers.nickname ? `[${editingOrder.customers.nickname}] ` : ''}${editingOrder.customers.name}` : '알 수 없음'}
                  disabled
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f8', borderRadius: '8px', background: '#f8fafc', color: '#6d7980', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#6d7980', marginBottom: '4px', fontWeight: 700 }}>상품명</label>
                <input
                  type="text"
                  value={editProduct}
                  onChange={(e) => setEditProduct(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#ffffff', color: '#151c27' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#6d7980', marginBottom: '4px', fontWeight: 700 }}>수량</label>
                  <input
                    type="number"
                    value={editQty}
                    onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    min="1"
                    required
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '13px', outline: 'none', textAlign: 'center', background: '#ffffff', color: '#151c27' }}
                  />
                </div>
                <div style={{ flex: 1.5 }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#6d7980', marginBottom: '4px', fontWeight: 700 }}>단가 (₩)</label>
                  <input
                    type="number"
                    value={editUnitPrice}
                    onChange={(e) => setEditUnitPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    min="0"
                    required
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '13px', outline: 'none', textAlign: 'right', background: '#ffffff', color: '#151c27' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#6d7980', marginBottom: '4px', fontWeight: 700 }}>담당 직원</label>
                  <select
                    value={editStaffId}
                    onChange={(e) => setEditStaffId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#ffffff', color: '#151c27', cursor: 'pointer' }}
                  >
                    <option value="">담당자 없음</option>
                    {staffs.map(s => (
                      <option key={s.staff_id} value={s.staff_id.toString()}>{s.staff_name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#6d7980', marginBottom: '4px', fontWeight: 700 }}>주문 상태</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#ffffff', color: '#151c27', cursor: 'pointer' }}
                  >
                    <option value="배송 전">배송 전</option>
                    <option value="정산서 발행">정산서 발행</option>
                    <option value="입금 완료">입금 완료</option>
                    <option value="배송 완료">배송 완료</option>
                    <option value="주문 취소">주문 취소</option>
                    <option value="환불 완료">환불 완료</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {editingOrder.order_status !== '주문 취소' && (
                    <button
                      type="button"
                      onClick={handleCancelOrderDirect}
                      disabled={loading}
                      style={{
                        padding: '10px 12px', background: '#ffe0e0', color: '#ba1a1a', border: '1px solid #ffb4ab',
                        borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>cancel</span>
                      취소
                    </button>
                  )}
                  {editingOrder.order_status !== '환불 완료' && (
                    <button
                      type="button"
                      onClick={handleRefundOrderDirect}
                      disabled={loading}
                      style={{
                        padding: '10px 12px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a',
                        borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>autorenew</span>
                      환불
                    </button>
                  )}
                  {editingOrder.order_status === '배송 전' && (
                    <button
                      type="button"
                      onClick={handleDeleteOrder}
                      disabled={loading}
                      style={{
                        padding: '10px 12px', background: '#ba1a1a', color: '#ffffff', border: 'none',
                        borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>delete_forever</span>
                      삭제
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    style={{
                      padding: '10px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
                      borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      padding: '10px 18px', background: '#006688', color: '#ffffff', border: 'none',
                      borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
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
