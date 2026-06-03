import React, { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { supabase } from '../supabase';

export default function Finance({ onDataChange }) {
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [showToast, setShowToast] = useState(false);

  // 계좌 정보 상태 추가
  const [bankInfo, setBankInfo] = useState('신한은행 110-456-789012 (예금주: 스마트주스토어)');
  const todayStr = new Date().toISOString().substring(0, 10);

  useEffect(() => {
    fetchInitialData();
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
        .select(`order_id, customer_id, product_name, quantity, unit_price, total_price, order_date, order_status`)
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

  const handleBulkCompleteFinance = async () => {
    if (currentInvoiceOrders.length === 0) return;
    if (!window.confirm(`${currentInvoiceCustomer?.name || '고객'}님의 주문 건 전체를 배송 완료로 변경하시겠습니까?`)) return;
    setLoading(true);
    try {
      const orderIds = currentInvoiceOrders.map(o => o.order_id);
      const { error } = await supabase
        .from('orders')
        .update({ order_status: '배송 완료' })
        .in('order_id', orderIds);
      if (error) throw error;
      setSelectedCustomerId(null);
      await fetchInitialData();
      if (onDataChange) onDataChange();
      alert('배송 완료 처리되었습니다.');
    } catch (err) {
      console.error('Error complete orders:', err);
      alert('배송 완료 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkIssueReceipt = async () => {
    const pendingOrders = currentInvoiceOrders.filter(o => o.order_status === '배송 전');
    if (pendingOrders.length === 0) {
      alert('정산서로 발행할 배송 전 주문 건이 없습니다.');
      return;
    }
    setLoading(true);
    try {
      const orderIds = pendingOrders.map(o => o.order_id);
      const { error } = await supabase
        .from('orders')
        .update({ order_status: '정산서 발행' })
        .in('order_id', orderIds);
      if (error) throw error;
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

  // 배송 전 주문이 있는 고객만 필터링 (정산서 발행 상태만 가진 고객은 목록에서 제외)
  const customersWithPendingOrders = customers.filter(c => 
    orders.some(o => o.customer_id === c.customer_id && o.order_status === '배송 전')
  );

  // 검색 적용
  const filteredCustomers = customersWithPendingOrders.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.nickname && c.nickname.toLowerCase().includes(searchQuery.toLowerCase())) ||
    c.phone.includes(searchQuery)
  );

  const currentInvoiceCustomer = customers.find(c => c.customer_id === selectedCustomerId);
  const currentInvoiceOrders = orders.filter(o => o.customer_id === selectedCustomerId);
  const currentInvoiceTotal = currentInvoiceOrders.reduce((sum, o) => sum + o.total_price, 0);

  return (
    <div style={{ fontFamily: "'Hanken Grotesk', 'Malgun Gothic', sans-serif", height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 페이지 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#151c27', margin: 0, letterSpacing: '-0.01em' }}>정산서 발행</h2>
          <p style={{ fontSize: '12px', color: '#6d7980', marginTop: '4px' }}>
            배송 전 상태인 고객 목록과 정산서를 관리합니다.
          </p>
        </div>
      </div>

      <div className="grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '16px', flex: 1, minHeight: 0 }}>
        
        {/* 좌측 (5칸): 배송 전 고객 목록 */}
        <div style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
          <div style={{ background: '#ffffff', border: '1px solid #bcc8d1', borderRadius: '8px', padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#151c27', margin: '0 0 16px 0' }}>배송 전 대기 고객</h4>
            
            {/* 검색창 */}
            <input
              type="text"
              placeholder="고객 이름, 닉네임 또는 연락처 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #bcc8d1', borderRadius: '8px', fontSize: '13px', outline: 'none', marginBottom: '16px' }}
            />
            
            {/* 리스트 영역 */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#6d7980' }}>로딩 중...</div>
              ) : filteredCustomers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#6d7980' }}>검색 결과가 없습니다.</div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredCustomers.map(cust => {
                    const custOrders = orders.filter(o => o.customer_id === cust.customer_id);
                    const custTotal = custOrders.reduce((sum, o) => sum + o.total_price, 0);
                    const isSelected = selectedCustomerId === cust.customer_id;
                    
                    return (
                      <li 
                        key={cust.customer_id}
                        onClick={() => setSelectedCustomerId(cust.customer_id)}
                        style={{
                          padding: '12px 16px',
                          border: `1px solid ${isSelected ? '#006688' : '#e2e8f8'}`,
                          borderRadius: '8px',
                          background: isSelected ? '#f0f3ff' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: isSelected ? '#006688' : '#151c27' }}>
                            {cust.nickname && <span style={{ fontSize: '14px' }}>{cust.nickname} </span>}
                            <span style={{ fontSize: '12px', color: '#6d7980' }}>{cust.name}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#6d7980', marginTop: '4px' }}>
                            {cust.phone} | 주문 {custOrders.length}건
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, color: '#006b5c', fontSize: '14px' }}>
                          ₩{custTotal.toLocaleString()}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* 우측 (7칸): 정산서 프리뷰 */}
        <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {selectedCustomerId && currentInvoiceCustomer ? (
            <>
              <div id="invoice-capture" className="receipt-paper" style={{ background: '#ffffff', border: '1px solid #bcc8d1', borderTop: '4px solid #006688', borderRadius: '8px', padding: '32px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexShrink: 0 }}>
                  <div>
                    <h4 style={{ fontSize: '32px', fontWeight: 700, color: '#151c27', margin: 0, letterSpacing: '-0.02em', fontFamily: "'Hanken Grotesk', sans-serif" }}>INVOICE</h4>
                    <p style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", color: '#6d7980', margin: '4px 0 0 0' }}>
                      NO. INV-{todayStr.replace(/-/g, '')}-{String(currentInvoiceCustomer.customer_id).padStart(4, '0')}
                    </p>
                  </div>
                </div>

                {/* 고객 및 청구처 */}
                <div style={{ padding: '16px', background: '#f0f3ff', borderRadius: '8px', marginBottom: '24px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, color: '#151c27', fontSize: '16px' }}>
                    {currentInvoiceCustomer.nickname ? `[${currentInvoiceCustomer.nickname}] ` : ''}{currentInvoiceCustomer.name} 님
                  </div>
                </div>

                {/* 청구 상세 내역 테이블 (모바일 가독성을 위해 폰트 및 패딩 확대) */}
                <div style={{ flex: 1 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #bcc8d1', background: '#f0f3ff' }}>
                        <th style={{ textAlign: 'left', padding: '12px 12px', color: '#6d7980', fontSize: '12px', textTransform: 'uppercase', fontWeight: 700 }}>구매일자</th>
                        <th style={{ textAlign: 'left', padding: '12px 12px', color: '#6d7980', fontSize: '12px', textTransform: 'uppercase', fontWeight: 700 }}>상품명</th>
                        <th style={{ textAlign: 'center', padding: '12px 8px', color: '#6d7980', fontSize: '12px', fontWeight: 700 }}>수량</th>
                        <th style={{ textAlign: 'right', padding: '12px 12px', color: '#6d7980', fontSize: '12px', fontWeight: 700 }}>금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentInvoiceOrders.map((o) => {
                        const statusColor = o.order_status === '배송 전' ? '#006688' : '#e65100';
                        return (
                          <tr key={o.order_id} style={{ borderBottom: '1px solid #cbd5e1' }}>
                            <td style={{ padding: '14px 12px', color: '#475569', fontSize: '13px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                              {o.order_date ? new Date(o.order_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '-'}
                            </td>
                            <td style={{ padding: '14px 12px', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '15px' }}>{o.product_name}</span>
                              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', color: statusColor, background: statusColor + '15', fontWeight: 700 }}>
                                {o.order_status}
                              </span>
                            </td>
                            <td style={{ padding: '14px 8px', textAlign: 'center', fontSize: '14px', fontWeight: 700 }}>{o.quantity}</td>
                            <td style={{ padding: '14px 12px', textAlign: 'right', fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                              ₩{o.total_price.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 정산 합계 (글자 크기 강조) */}
                <div style={{ borderTop: '3px dashed #006688', paddingTop: '18px', marginTop: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#006688' }}>Grand Total</span>
                  <span style={{ fontSize: '28px', fontWeight: 800, color: '#006688' }}>
                    ₩{currentInvoiceTotal.toLocaleString()}
                  </span>
                </div>

                {/* 입금 계좌 (글자 크기 확대) */}
                <div style={{ marginTop: '28px', fontSize: '14px', fontWeight: 700, color: '#1e293b', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1.5px solid #bcc8d1', flexShrink: 0, textAlign: 'center', letterSpacing: '-0.3px' }}>
                  {bankInfo}
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
                  title="배송 완료 처리"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>local_shipping</span>
                  배송 완료
                </button>
                <button
                  onClick={handleBulkIssueReceipt}
                  disabled={loading || !currentInvoiceOrders.some(o => o.order_status === '배송 전')}
                  style={{
                    flex: 1.5, padding: '12px', background: '#e65100', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                    cursor: loading || !currentInvoiceOrders.some(o => o.order_status === '배송 전') ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: !currentInvoiceOrders.some(o => o.order_status === '배송 전') ? 0.6 : 1
                  }}
                >
                  <span className="material-symbols-outlined">receipt_long</span>
                  정산서 발행
                </button>
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

              {/* 입금 계좌 설정 직접 입력 칸 */}
              <div style={{ marginTop: '16px', background: '#ffffff', border: '1px solid #bcc8d1', borderRadius: '8px', padding: '16px', flexShrink: 0 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#3d484f', marginBottom: '6px' }}>입금 계좌 설정</label>
                <input 
                  type="text" 
                  value={bankInfo} 
                  onChange={(e) => setBankInfo(e.target.value)} 
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #bcc8d1', borderRadius: '6px', fontSize: '13px', outline: 'none', fontFamily: "'Hanken Grotesk', sans-serif" }}
                  placeholder="인보이스에 노출될 계좌번호를 입력하세요"
                />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #bcc8d1', borderRadius: '8px', background: 'rgba(255,255,255,0.5)', color: '#6d7980' }}>
              좌측 목록에서 정산서를 발행할 고객을 선택해주세요.
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
