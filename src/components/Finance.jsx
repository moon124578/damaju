import React, { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { supabase } from '../supabase';
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

export default function Finance({ onDataChange }) {
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 선택 기준을 고객ID가 아닌 고유 '행 키' (invoice_id 혹은 customer_id-상태 조합 등)로 관리합니다.
  const [selectedRowKey, setSelectedRowKey] = useState(null);
  const [showToast, setShowToast] = useState(false);

  // 계좌 정보 상태 추가 (Supabase DB 연동)
  const [bankInfo, setBankInfo] = useState('신한은행 110-456-789012 (예금주: 스마트주스토어)');
  
  // 인보이스 폰트 크기 상태 추가 (Supabase DB 연동)
  const [invoiceFontSize, setInvoiceFontSize] = useState('14');
  
  const todayStr = new Date().toISOString().substring(0, 10);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*');
      if (error) throw error;
      if (data) {
        const bank = data.find(item => item.key === 'bank_account_info');
        const size = data.find(item => item.key === 'invoice_font_size');
        if (bank) setBankInfo(bank.value);
        if (size) setInvoiceFontSize(size.value);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  useEffect(() => {
    fetchInitialData();
    fetchSettings();

    const updateAccount = () => { fetchSettings(); };
    const updateStyle = () => { fetchSettings(); };
    
    window.addEventListener('bank_info_changed', updateAccount);
    window.addEventListener('invoice_style_changed', updateStyle);
    
    return () => {
      window.removeEventListener('bank_info_changed', updateAccount);
      window.removeEventListener('invoice_style_changed', updateStyle);
    };
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const { data: custData, error: custErr } = await supabase
        .from('customers')
        .select('customer_id, nickname, name, phone, address')
        .order('customer_id', { ascending: true });
      if (custErr) throw custErr;

      const { data: ordData, error: ordErr } = await supabase
        .from('orders')
        .select(`order_id, customer_id, product_name, quantity, unit_price, total_price, order_date, order_status, invoice_id`)
        .in('order_status', ['배송 전', '정산서 발행']);
      if (ordErr) throw ordErr;

      setCustomers(custData || []);
      setOrders(ordData || []);
    } catch (err) {
      console.error(err);
      alert('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInvoice = () => {
    const invoiceElement = document.getElementById('invoice-capture');
    if (!invoiceElement) return;

    html2canvas(invoiceElement, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    }).then((canvas) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          alert('영수증 이미지를 캡처하지 못했습니다.');
          return;
        }

        navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ])
          .then(() => {
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
          })
          .catch((err) => {
            console.error(err);
            alert('클립보드 복사에 실패했습니다. 아래 다운로드 버튼을 사용해 주세요.');
          });
      }, 'image/png');
    });
  };

  const handleDownloadInvoice = () => {
    const invoiceElement = document.getElementById('invoice-capture');
    if (!invoiceElement) return;

    html2canvas(invoiceElement, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    }).then((canvas) => {
      const link = document.createElement('a');
      link.download = `정산서_${currentInvoiceCustomer?.name || '고객'}_${todayStr}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  };

  // '배송 전', '정산서 발행' 주문들을 고유 그룹으로 가공
  const financeRows = [];
  customers.forEach(cust => {
    const custOrders = orders.filter(o => o.customer_id === cust.customer_id);
    if (custOrders.length === 0) return;

    // 1. 배송 전 주문 건들 (새롭게 정산 발행할 묶음)
    const pendingOrders = custOrders.filter(o => o.order_status === '배송 전');
    if (pendingOrders.length > 0) {
      const totalAmount = pendingOrders.reduce((sum, o) => sum + o.total_price, 0);
      financeRows.push({
        rowKey: `${cust.customer_id}-PENDING`,
        customer: cust,
        order_status: '배송 전',
        invoice_id: null,
        items: pendingOrders,
        totalAmount
      });
    }

    // 2. 이미 정산서 발행 완료된 주문 건들 (invoice_id 기준 그룹화, 배송 전이 아닌 '정산서 발행' 상태만 포함)
    const issuedOrders = custOrders.filter(o => o.order_status === '정산서 발행');
    if (issuedOrders.length > 0) {
      const groups = {};
      issuedOrders.forEach(o => {
        const invId = o.invoice_id || `OLD-ISSUED-${cust.customer_id}`;
        if (!groups[invId]) {
          groups[invId] = [];
        }
        groups[invId].push(o);
      });

      Object.entries(groups).forEach(([invId, groupItems]) => {
        const totalAmount = groupItems.reduce((sum, o) => sum + o.total_price, 0);
        financeRows.push({
          rowKey: `${cust.customer_id}-${invId}`,
          customer: cust,
          order_status: '정산서 발행', // 화면 리스트에서는 '발행 완료' 뱃지 표시를 위해 동일하게 설정
          invoice_id: invId.startsWith('OLD-ISSUED') ? null : invId,
          items: groupItems,
          totalAmount
        });
      });
    }
  });

  // 검색어 적용 (초성 검색 지원)
  const filteredRows = financeRows.filter(row => {
    const nameMatch = matchChosung(row.customer.name, searchQuery);
    const nickMatch = row.customer.nickname && matchChosung(row.customer.nickname, searchQuery);
    const phoneMatch = row.customer.phone.includes(searchQuery);
    return nameMatch || nickMatch || phoneMatch;
  });

  // 정렬 적용 (sortBy: 'pendingFirst', 'amountDesc', 'nameAsc')
  const [sortBy, setSortBy] = useState('pendingFirst');
  const sortedRows = [...filteredRows].sort((a, b) => {
    if (sortBy === 'pendingFirst') {
      const aVal = a.order_status === '배송 전' ? 0 : 1;
      const bVal = b.order_status === '배송 전' ? 0 : 1;
      if (aVal !== bVal) return aVal - bVal;
    }
    if (sortBy === 'amountDesc') {
      return b.totalAmount - a.totalAmount;
    }
    if (sortBy === 'nameAsc') {
      const aName = a.customer.nickname || a.customer.name;
      const bName = b.customer.nickname || b.customer.name;
      return aName.localeCompare(bName, 'ko');
    }
    return 0;
  });

  // 현재 선택된 행 찾기
  const selectedRow = financeRows.find(row => row.rowKey === selectedRowKey);
  const currentInvoiceCustomer = selectedRow ? selectedRow.customer : null;
  const currentInvoiceOrders = selectedRow ? selectedRow.items : [];
  const currentInvoiceTotal = selectedRow ? selectedRow.totalAmount : 0;

  const handleBulkCompleteFinance = async () => {
    if (!selectedRow || currentInvoiceOrders.length === 0) return;
    if (!window.confirm(`${currentInvoiceCustomer?.name || '고객'}님의 선택한 묶음 주문 전체를 입금 완료로 변경하시겠습니까?`)) return;
    setLoading(true);
    try {
      const orderIds = currentInvoiceOrders.map(o => o.order_id);
      const { error } = await supabase
        .from('orders')
        .update({ order_status: '입금 완료' })
        .in('order_id', orderIds);
      if (error) throw error;
      setSelectedRowKey(null);
      await fetchInitialData();
      if (onDataChange) onDataChange();
      alert('입금 완료 처리되었습니다.');
    } catch (err) {
      console.error('Error complete orders:', err);
      alert('입금 완료 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkIssueReceipt = async () => {
    if (!selectedRow || selectedRow.order_status !== '배송 전') {
      alert('정산서로 발행할 배송 전 주문 건이 없습니다.');
      return;
    }
    setLoading(true);
    try {
      const orderIds = currentInvoiceOrders.map(o => o.order_id);
      const uniqueInvoiceId = `INV-${Date.now()}`;
      const { error } = await supabase
        .from('orders')
        .update({ 
          order_status: '정산서 발행',
          invoice_id: uniqueInvoiceId
        })
        .in('order_id', orderIds);
      if (error) throw error;
      setSelectedRowKey(null);
      await fetchInitialData();
      if (onDataChange) onDataChange();
      alert('정산서 발행 상태로 변경되었습니다.');
    } catch (err) {
      console.error('Error issue receipt:', err);
      alert('정산서 발행 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Hanken Grotesk', 'Malgun Gothic', sans-serif", height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 페이지 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#151c27', margin: 0, letterSpacing: '-0.01em' }}>정산서 발행</h2>
          <p style={{ fontSize: '12px', color: '#6d7980', marginTop: '4px' }}>
            고객별 정산 차수 단위로 목록을 제공하며, 새롭게 추가된 주문 건들을 인보이스로 발행할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '16px', flex: 1, minHeight: 0 }}>
        
        {/* 좌측 (5칸): 정산 대상 목록 */}
        <div style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
          <div style={{ background: '#ffffff', border: '1px solid #bcc8d1', borderRadius: '8px', padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#151c27', margin: '0 0 16px 0' }}>정산 관리 대상 목록</h4>
            
            {/* 검색창 & 정렬 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="고객 이름, 닉네임 또는 연락처 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, padding: '10px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#ffffff', cursor: 'pointer', color: '#151c27', fontWeight: 600 }}
              >
                <option value="pendingFirst">대기 우선</option>
                <option value="amountDesc">금액 높은 순</option>
                <option value="nameAsc">이름 순</option>
              </select>
            </div>
            
            {/* 리스트 영역 */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#6d7980' }}>로딩 중...</div>
              ) : sortedRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#6d7980' }}>검색 결과가 없습니다.</div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sortedRows.map(row => {
                    const isSelected = selectedRowKey === row.rowKey;
                    const isIssued = row.order_status === '정산서 발행';
                    
                    const itemBg = isSelected 
                      ? (isIssued ? '#fff3e0' : '#f0f3ff') 
                      : (isIssued ? '#fffafd' : '#ffffff');
                    
                    const itemBorder = isSelected 
                      ? (isIssued ? '#e65100' : '#006688') 
                      : (isIssued ? '#ffe0b2' : '#e2e8f8');

                    const nameColor = isSelected 
                      ? (isIssued ? '#e65100' : '#006688') 
                      : (isIssued ? '#c25e00' : '#151c27');
                    
                    return (
                      <li 
                        key={row.rowKey}
                        onClick={() => setSelectedRowKey(row.rowKey)}
                        style={{
                          padding: '12px 16px',
                          border: `1px solid ${itemBorder}`,
                          borderRadius: '8px',
                          background: itemBg,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: nameColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {row.customer.nickname && <span style={{ fontSize: '14px' }}>{row.customer.nickname}</span>}
                            <span style={{ fontSize: '12px', color: '#6d7980' }}>({row.customer.name})</span>
                            {isIssued ? (
                              <span style={{ 
                                fontSize: '10px', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                background: '#e65100', 
                                color: '#ffffff', 
                                fontWeight: 700 
                              }}>
                                발행 완료
                              </span>
                            ) : (
                              <span style={{ 
                                fontSize: '10px', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                background: '#006688', 
                                color: '#ffffff', 
                                fontWeight: 700 
                              }}>
                                신규 대기
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: '#6d7980', marginTop: '4px' }}>
                            {formatPhoneNumber(row.customer.phone)} | {isIssued ? '발행 품목' : '신규 추가'} {row.items.length}건
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, color: '#006b5c', fontSize: '14px' }}>
                          ₩{row.totalAmount.toLocaleString()}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* 우측 (7칸): 정산서 프리뷰 */}
        <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {selectedRowKey && currentInvoiceCustomer ? (
            <>
              <div id="invoice-capture" className="receipt-paper" style={{ background: '#ffffff', border: '1px solid #bcc8d1', borderTop: '4px solid #006688', borderRadius: '8px', padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', flexShrink: 0, width: '100%' }}>
                  <h4 style={{ fontSize: `${Number(invoiceFontSize) + 20}px`, fontWeight: 800, color: '#151c27', margin: 0, letterSpacing: '0.05em', fontFamily: "'Hanken Grotesk', sans-serif", textAlign: 'center' }}>INVOICE</h4>
                  <p style={{ fontSize: `${Number(invoiceFontSize) - 2}px`, fontFamily: "'JetBrains Mono', monospace", color: '#6d7980', margin: '6px 0 0 0', textAlign: 'center' }}>
                    NO. INV-{todayStr.replace(/-/g, '')}-{String(currentInvoiceCustomer.customer_id).padStart(4, '0')}
                  </p>
                </div>

                {/* 고객 및 청구처 */}
                <div style={{ padding: '12px 16px', background: '#f0f3ff', borderRadius: '8px', marginBottom: '16px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, color: '#151c27', fontSize: `${Number(invoiceFontSize) + 2}px` }}>
                    {currentInvoiceCustomer.nickname ? `[${currentInvoiceCustomer.nickname}] ` : ''}{currentInvoiceCustomer.name} 님
                  </div>
                </div>

                {/* 청구 상세 내역 테이블 */}
                <div style={{ flex: 1 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #bcc8d1', background: '#f0f3ff' }}>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: '#6d7980', fontSize: `${Number(invoiceFontSize) - 2}px`, textTransform: 'uppercase', fontWeight: 700 }}>구매일자</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: '#6d7980', fontSize: `${Number(invoiceFontSize) - 2}px`, textTransform: 'uppercase', fontWeight: 700 }}>상품명</th>
                        <th style={{ textAlign: 'center', padding: '10px 8px', color: '#6d7980', fontSize: `${Number(invoiceFontSize) - 2}px`, fontWeight: 700 }}>수량</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px', color: '#6d7980', fontSize: `${Number(invoiceFontSize) - 2}px`, fontWeight: 700 }}>금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentInvoiceOrders.map((o) => {
                        return (
                          <tr key={o.order_id} style={{ borderBottom: '1px solid #cbd5e1' }}>
                            <td style={{ padding: '10px 12px', color: '#475569', fontSize: `${Number(invoiceFontSize) - 1}px`, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                              {o.order_date ? new Date(o.order_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '-'}
                            </td>
                            <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: `${Number(invoiceFontSize) + 1}px` }}>{o.product_name}</span>
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: `${Number(invoiceFontSize)}px`, fontWeight: 700 }}>{o.quantity}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: `${Number(invoiceFontSize) + 1}px`, fontWeight: 800, color: '#0f172a' }}>
                              ₩{o.total_price.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 정산 합계 */}
                <div style={{ borderTop: '2px dashed #006688', paddingTop: '12px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: `${Number(invoiceFontSize) + 2}px`, fontWeight: 700, color: '#006688' }}>Grand Total</span>
                  <span style={{ fontSize: `${Number(invoiceFontSize) + 10}px`, fontWeight: 800, color: '#006688' }}>
                    ₩{currentInvoiceTotal.toLocaleString()}
                  </span>
                </div>

                {/* 입금 계좌 */}
                <div style={{ marginTop: '16px', fontSize: `${Number(invoiceFontSize) + 1}px`, fontWeight: 700, color: '#1e293b', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1.5px solid #bcc8d1', flexShrink: 0, textAlign: 'center', letterSpacing: '-0.3px' }}>
                  {bankInfo}
                </div>

                {/* 하단 감사 멘트 */}
                <div style={{ marginTop: '16px', fontSize: `${Number(invoiceFontSize) - 1}px`, color: '#6d7980', textAlign: 'center', fontWeight: 500, fontStyle: 'italic', letterSpacing: '-0.3px', borderTop: '1px solid #e2e8f8', paddingTop: '12px' }}>
                  예쁜 거, 다 담아드릴게요. 이용해 주셔서 감사합니다! ❤️
                </div>
              </div>

              {/* 정산서 액션 버튼 */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={handleBulkCompleteFinance}
                  disabled={loading}
                  style={{
                    flex: 0.8, padding: '12px 8px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                  }}
                  title="입금 완료 처리"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>payments</span>
                  입금 완료
                </button>
                {selectedRow.order_status === '배송 전' && (
                  <button
                    onClick={handleBulkIssueReceipt}
                    disabled={loading}
                    style={{
                      flex: 1.5, padding: '12px', background: '#e65100', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}
                  >
                    <span className="material-symbols-outlined">receipt_long</span>
                    정산서 발행
                  </button>
                )}
                <button
                  onClick={handleDownloadInvoice}
                  style={{ flex: 1, padding: '12px', background: '#f0f3ff', color: '#006688', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <span className="material-symbols-outlined">download</span>
                  이미지 저장
                </button>
                <button
                  onClick={handleCopyInvoice}
                  style={{ flex: 1.5, padding: '12px', background: '#006688', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <span className="material-symbols-outlined">content_copy</span>
                  클립보드 복사
                </button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #bcc8d1', borderRadius: '8px', background: 'rgba(255,255,255,0.5)', color: '#6d7980' }}>
              좌측 목록에서 정산서를 발행할 대상을 선택해주세요.
            </div>
          )}
        </div>
      </div>

      {/* 토스트 팝업 알림 */}
      <div className={`toast-notification ${showToast ? 'show' : ''}`} style={{ background: '#151c27', border: '1px solid #bcc8d1' }}>
        <span className="material-symbols-outlined" style={{ color: '#68fadd', fontSize: '20px' }}>check_circle</span>
        <div>
          <p style={{ fontSize: '12px', fontWeight: 'bold', margin: 0, color: '#ffffff' }}>정산서 복사 완료!</p>
          <p style={{ fontSize: '10px', color: '#bcc8d1', margin: '2px 0 0 0' }}>카톡 창에 붙여넣기(Ctrl+V)하세요.</p>
        </div>
      </div>

    </div>
  );
}
