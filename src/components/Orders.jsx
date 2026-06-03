import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

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


  // 1. 주문 폼 상태
  const [custQuery, setCustQuery] = useState('');
  const [custSuggestions, setCustSuggestions] = useState([]);
  const [activeCustIdx, setActiveCustIdx] = useState(-1);
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [prodQuery, setProdQuery] = useState('');
  const [prodSuggestions, setProdSuggestions] = useState([]);
  const [activeProdIdx, setActiveProdIdx] = useState(-1);
  const [showProdDropdown, setShowProdDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [qty, setQty] = useState(1);
  const [orderStaffId, setOrderStaffId] = useState('');

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
        setOrderStaffId(staffData[0].staff_id.toString());
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
          order_id, customer_id, product_name, quantity, unit_price, total_price, order_date, order_status,
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
        c.name.toLowerCase().includes(val.toLowerCase()) ||
        (c.nickname && c.nickname.toLowerCase().includes(val.toLowerCase()))
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
    setCustQuery(cust.nickname || cust.name);
    setShowCustDropdown(false);
  };

  // 상품 검색 자동완성 핸들러
  const handleProdChange = (e) => {
    const val = e.target.value;
    setProdQuery(val);
    setSelectedProduct(null);
    if (val.trim()) {
      const matches = products.filter((p) =>
        p.name.toLowerCase().includes(val.toLowerCase())
      );
      setProdSuggestions(matches);
      setShowProdDropdown(true);
      setActiveProdIdx(-1);
    } else {
      setProdSuggestions([]);
      setShowProdDropdown(false);
    }
  };

  const handleProdKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveProdIdx((prev) => Math.min(prev + 1, prodSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveProdIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeProdIdx >= 0 && activeProdIdx < prodSuggestions.length) {
        selectProd(prodSuggestions[activeProdIdx]);
      }
    } else if (e.key === 'Escape') {
      setShowProdDropdown(false);
    }
  };

  const selectProd = (prod) => {
    setSelectedProduct(prod);
    setProdQuery(prod.name);
    setShowProdDropdown(false);
  };

  // 장바구니 담기 (주문 추가)
  const handleAddToCart = (e) => {
    e.preventDefault();
    if (!custQuery.trim() || !prodQuery.trim()) {
      alert('고객명과 상품명을 입력해주세요.');
      return;
    }

    // 고객정보 유효성 검증
    const typedQuery = custQuery.trim();
    // 닉네임 혹은 이름이 완벽히 일치하거나, 자동완성 포맷 "[닉네임] 이름" 형태인 경우 추출하여 찾음
    let matchCust = customers.find(c => c.nickname === typedQuery || c.name === typedQuery);
    
    if (!matchCust && typedQuery.startsWith('[') && typedQuery.includes(']')) {
      const closingBracketIdx = typedQuery.indexOf(']');
      const parsedNickname = typedQuery.substring(1, closingBracketIdx).trim();
      matchCust = customers.find(c => c.nickname === parsedNickname);
    }

    if (!matchCust) {
      alert('회원정보(고객)에 존재하지 않는 닉네임/이름입니다. 회원정보 탭에서 먼저 고객을 등록해주세요.');
      return;
    }

    // 상품정보 유효성 검증
    const matchProd = products.find(p => p.name === prodQuery.trim());
    if (!matchProd) {
      alert('상품관리에 등록되지 않은 상품명입니다. 정확한 상품명을 입력해주세요.');
      return;
    }

    const unitPrice = matchProd.selling_price;
    const staffId = orderStaffId ? Number(orderStaffId) : null;

    const newItem = {
      id: Date.now() + Math.random(),
      custQuery: custQuery.trim(),
      selectedCustomer: matchCust,
      prodQuery: prodQuery.trim(),
      selectedProduct: matchProd,
      quantity: Number(qty),
      unitPrice,
      totalPrice: unitPrice * Number(qty),
      staffId,
    };

    setCartItems([...cartItems, newItem]);

    // 상품명과 수량만 초기화 (고객 정보 유지)
    setProdQuery('');
    setSelectedProduct(null);
    setQty(1);
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
        let custId = item.selectedCustomer ? item.selectedCustomer.customer_id : null;
        if (!custId) {
          const match = customers.find(c => c.name === item.custQuery || c.nickname === item.custQuery);
          if (match) {
            custId = match.customer_id;
          }
        }

        if (!custId) {
          throw new Error(`고객 정보를 찾을 수 없습니다: ${item.custQuery}`);
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
      const { error } = await supabase
        .from('orders')
        .update({ order_status: newStatus })
        .eq('order_id', orderId);
      if (error) throw error;
      await fetchOrders();
      onDataChange();
    } catch (err) {
      console.error('Error updating status:', err);
      alert('상태 변경 실패');
    }
  };

  const handleBulkComplete = async () => {
    if (selectedOrderIds.length === 0) return;
    if (!window.confirm(`선택한 ${selectedOrderIds.length}건의 주문을 배송 완료 처리하시겠습니까?`)) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_status: '배송 완료' })
        .in('order_id', selectedOrderIds);
      if (error) throw error;
      setSelectedOrderIds([]);
      await fetchOrders();
      onDataChange();
      alert('일괄 배송 완료 처리되었습니다.');
    } catch (err) {
      console.error('Error bulk updating status:', err);
      alert('일괄 배송 완료 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkCompleteIssuedReceipts = async () => {
    const issuedOrders = orders.filter(o => o.order_status === '정산서 발행');
    if (issuedOrders.length === 0) {
      alert('배송 완료 처리할 "정산서 발행" 상태의 주문 건이 없습니다.');
      return;
    }

    // 1단계 확인 안전장치
    if (!window.confirm(`[안전장치 1단계] "정산서 발행" 상태인 주문 ${issuedOrders.length}건 전체를 "배송 완료"로 변경하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }
    // 2단계 확인 안전장치
    if (!window.confirm(`[안전장치 2단계 - 최종 확인] 정말로 진행하시겠습니까? 실제 상품 배송 처리가 물리적으로 완료되었는지 다시 한 번 확인해 주시기 바랍니다.`)) {
      return;
    }

    setLoading(true);
    try {
      const orderIds = issuedOrders.map(o => o.order_id);
      const { error } = await supabase
        .from('orders')
        .update({ order_status: '배송 완료' })
        .in('order_id', orderIds);
      if (error) throw error;

      await fetchOrders();
      onDataChange();
      alert('정산서 발행 건들의 일괄 배송 완료 처리가 성공적으로 완료되었습니다.');
    } catch (err) {
      console.error('Error updating issued orders to completed:', err);
      alert('일괄 배송 완료 처리 중 오류가 발생했습니다.');
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
    if (!orderSearchQuery.trim()) return true;
    const q = orderSearchQuery.toLowerCase();
    const custNickname = o.customers?.nickname?.toLowerCase() || '';
    const custName = o.customers?.name?.toLowerCase() || '';
    const prodName = o.product_name?.toLowerCase() || '';
    const staffName = o.staffs?.staff_name?.toLowerCase() || '';
    return custNickname.includes(q) || custName.includes(q) || prodName.includes(q) || staffName.includes(q);
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
            
            <form onSubmit={handleAddToCart} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              
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

              {/* 물품명 입력 */}
              <div style={{ flex: 3, minWidth: '220px', position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#6d7980', marginBottom: '4px', fontFamily: "'JetBrains Mono', monospace" }}>물품명 입력</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="text"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '14px', fontFamily: "'Hanken Grotesk', sans-serif", outline: 'none', background: '#ffffff' }}
                      placeholder="예: 프리미엄"
                      value={prodQuery}
                      onChange={handleProdChange}
                      onKeyDown={handleProdKeyDown}
                      onFocus={() => setShowProdDropdown(true)}
                      onBlur={() => setTimeout(() => setShowProdDropdown(false), 200)}
                      required
                      autoComplete="off"
                    />
                    {showProdDropdown && prodSuggestions.length > 0 && (
                      <div className="autocomplete-dropdown" style={{ width: '100%' }}>
                        {prodSuggestions.map((prod, idx) => (
                          <div
                            key={prod.id}
                            className={`suggestion-item ${idx === activeProdIdx ? 'active' : ''}`}
                            onMouseDown={() => selectProd(prod)}
                            style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}
                          >
                            <span>{prod.name}</span>
                            <span style={{ fontSize: '11px', color: '#6d7980', fontFamily: "'JetBrains Mono', monospace" }}>₩{prod.selling_price.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* 수량 */}
                  <div style={{ width: '80px' }}>
                    <input
                      type="number"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '14px', fontFamily: "'JetBrains Mono', monospace", outline: 'none', background: '#ffffff', textAlign: 'center' }}
                      placeholder="수량"
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      min="1"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* 담당 직원 */}
              <div style={{ width: '120px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#6d7980', marginBottom: '4px', fontFamily: "'JetBrains Mono', monospace" }}>담당 직원</label>
                <select
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '14px', fontFamily: "'Hanken Grotesk', sans-serif", outline: 'none', background: '#ffffff' }}
                  value={orderStaffId}
                  onChange={(e) => setOrderStaffId(e.target.value)}
                >
                  {staffs.map(s => (
                    <option key={s.staff_id} value={s.staff_id.toString()}>{s.staff_name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
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
                  주문 추가
                </button>
              </div>
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
                        <span style={{ fontWeight: 600, color: '#006688', minWidth: '80px' }}>{item.custQuery}</span>
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
                  <option value="배송 완료">배송 완료</option>
                  <option value="주문 취소">주문 취소</option>
                </select>

                {/* 일괄 배송 완료 버튼 */}
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
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>local_shipping</span>
                    일괄 배송완료 ({selectedOrderIds.length})
                  </button>
                )}

                {/* 정산서 발행 -> 배송 완료 일괄 처리 버튼 */}
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
                  title="정산서 발행 상태의 모든 주문 건을 배송 완료 상태로 변경합니다"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>task_alt</span>
                  정산서발행 일괄 배송완료
                </button>
              </div>
              <span style={{ fontSize: '11px', color: '#6d7980', fontFamily: "'JetBrains Mono', monospace" }}>Today: {todayOrders.length} Orders</span>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table className="stitch-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f0f3ff' }}>
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
                    <th style={{ padding: '12px 24px', fontSize: '12px', color: '#3d484f', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace' }}>상태</th>
                    <th style={{ padding: '12px 24px', fontSize: '12px', color: '#3d484f', fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={filterStatus === '배송 전' ? "8" : "7"} style={{ textAlign: 'center', color: '#6d7980', padding: '32px' }}>주문 내역이 없습니다.</td>
                    </tr>
                  ) : (
                    sortedOrders.map((o) => {
                      const isCancelled = o.order_status === '주문 취소';
                      const statusColor = o.order_status === '배송 전' ? '#006688' : o.order_status === '정산서 발행' ? '#e65100' : o.order_status === '배송 완료' ? '#006b5c' : '#ba1a1a';
                      return (
                        <tr key={o.order_id} className="stitch-tr" style={{ opacity: isCancelled ? 0.55 : 1, textDecoration: isCancelled ? 'line-through' : 'none', borderBottom: '1px solid #e2e8f8' }}>
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
                              setFilterStatus('배송 전');
                              setOrderSearchQuery(o.customers?.nickname || o.customers?.name || '');
                              setSelectedOrderIds([]);
                            }}
                            title="클릭 시 이 고객의 배송 전 품목만 필터링합니다"
                          >
                            {o.customers?.nickname && <span style={{ fontSize: '14px', color: '#006688', display: 'block', fontWeight: 700 }}>{o.customers.nickname}</span>}
                            <span style={{ fontSize: '11px', color: '#6d7980' }}>{o.customers?.name || '신규'}</span>
                          </td>
                          <td style={{ padding: '12px 24px', color: '#3d484f' }}>{o.product_name}</td>
                          <td style={{ padding: '12px 24px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" }}>{o.quantity}</td>
                          <td style={{ padding: '12px 24px', color: '#3d484f', fontSize: '13px' }}>
                            {o.staffs?.staff_name || '-'}
                          </td>
                          <td style={{ padding: '12px 24px' }}>
                            <select
                              value={o.order_status}
                              onChange={(e) => handleStatusChange(o.order_id, e.target.value)}
                              style={{ border: '1px solid #bcc8d1', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontFamily: "'Hanken Grotesk', sans-serif", color: statusColor, background: statusColor + '15', cursor: 'pointer', outline: 'none' }}
                            >
                              <option value="배송 전">배송 전</option>
                              <option value="정산서 발행">정산서 발행</option>
                              <option value="배송 완료">배송 완료</option>
                              <option value="주문 취소">주문 취소</option>
                            </select>
                          </td>
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
    </div>
  );
}
