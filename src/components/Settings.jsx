import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import * as XLSX from 'xlsx';

export default function Settings({ user }) {
  const [bankInfo, setBankInfo] = useState(
    localStorage.getItem('bank_account_info') || '신한은행 110-456-789012 (예금주: 스마트주스토어)'
  );
  
  // 인보이스 폰트 크기 설정 상태
  const [invoiceFontSize, setInvoiceFontSize] = useState(
    localStorage.getItem('invoice_font_size') || '14'
  );

  // 비밀번호 변경 관련 상태
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // 관리자 목록 및 추가 관련 상태
  const [adminList, setAdminList] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  
  const [newAdminUser, setNewAdminUser] = useState('');
  const [newAdminPw, setNewAdminPw] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // 엑셀 다운로드 중 상태
  const [excelLoading, setExcelLoading] = useState(false);

  // 활성 분류 탭 ('dashboard', 'customers', 'orders', 'finance', 'employees', 'products', 'settings')
  const [activeSubTab, setActiveSubTab] = useState('dashboard');

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setListLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, name, role')
        .order('id', { ascending: true });
      if (error) throw error;
      setAdminList(data || []);
    } catch (err) {
      console.error('Error fetching admins:', err);
    } finally {
      setListLoading(false);
    }
  };

  const handleSaveBankInfo = () => {
    localStorage.setItem('bank_account_info', bankInfo);
    window.dispatchEvent(new Event('bank_info_changed'));
    alert('계좌번호 설정이 저장되었습니다.');
  };

  const handleSaveFontSize = () => {
    localStorage.setItem('invoice_font_size', invoiceFontSize);
    window.dispatchEvent(new Event('invoice_style_changed'));
    alert('인보이스 글자 크기 설정이 저장되었습니다.');
  };

  // 비밀번호 변경 처리 (현재 로그인한 admin 계정)
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!newPassword.trim()) {
      alert('새로운 비밀번호를 입력해주세요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setPwLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ password: newPassword.trim() })
        .eq('id', user.id);

      if (error) throw error;
      alert('비밀번호가 변경되었습니다. 다음 로그인 시 새 비밀번호가 적용됩니다.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error(err);
      alert('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setPwLoading(false);
    }
  };

  // 신규 관리자 생성 처리
  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminUser.trim() || !newAdminPw.trim() || !newAdminName.trim()) {
      alert('아이디, 비밀번호, 이름을 모두 입력해주세요.');
      return;
    }

    // 아이디 중복 체크
    const duplicate = adminList.some(admin => admin.username === newAdminUser.trim());
    if (duplicate) {
      alert('이미 존재하는 관리자 아이디입니다.');
      return;
    }

    setCreateLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .insert({
          username: newAdminUser.trim(),
          password: newAdminPw.trim(),
          name: newAdminName.trim(),
          role: 'admin'
        });

      if (error) throw error;
      alert('신규 관리자 계정이 생성되었습니다.');
      setNewAdminUser('');
      setNewAdminPw('');
      setNewAdminName('');
      await fetchAdmins();
    } catch (err) {
      console.error(err);
      alert('관리자 계정 생성 중 오류가 발생했습니다.');
    } finally {
      setCreateLoading(false);
    }
  };

  // 관리자 삭제 기능
  const handleDeleteAdmin = async (adminId, adminUsername) => {
    if (adminUsername === 'admin') {
      alert('최고 관리자(admin) 계정은 삭제할 수 없습니다.');
      return;
    }
    if (adminId === user.id) {
      alert('현재 로그인 중인 본인 계정은 삭제할 수 없습니다.');
      return;
    }

    if (!window.confirm(`정말로 관리자 계정 [${adminUsername}]을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', adminId);

      if (error) throw error;
      alert('관리자 계정이 성공적으로 삭제되었습니다.');
      await fetchAdmins();
    } catch (err) {
      console.error(err);
      alert('관리자 계정 삭제 중 오류가 발생했습니다.');
    }
  };

  // 설정에서 통합 엑셀 다운로드 실행
  const handleExcelDownload = async () => {
    setExcelLoading(true);
    try {
      // 1. 고객 목록 로드
      const { data: customersData, error: custErr } = await supabase
        .from('customers')
        .select('*');
      if (custErr) throw custErr;

      // 2. 주문 목록 로드
      const { data: ordersData, error: ordErr } = await supabase
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

      if (!customersData || customersData.length === 0) {
        alert('다운로드할 고객 정보가 없습니다.');
        return;
      }

      // Sheet 1: 고객 정보 DB
      const sheet1Data = customersData.map((c) => {
        // 해당 고객의 통계 계산
        const custOrders = (ordersData || []).filter(o => o.customer_id === c.customer_id);
        const orderCount = custOrders.length;
        const totalQty = custOrders.reduce((sum, o) => sum + o.quantity, 0);
        const cancelCount = custOrders.filter(o => o.order_status === '주문 취소').length;
        const totalAmount = custOrders.filter(o => o.order_status !== '주문 취소').reduce((sum, o) => sum + o.total_price, 0);
        
        return {
          '고객 ID': c.customer_id,
          '닉네임': c.nickname || '',
          '고객명': c.name,
          '연락처': c.phone,
          '배송지 주소': c.address || '미입력',
          '주문 횟수': orderCount,
          '누적 수량': totalQty,
          '취소 횟수': cancelCount,
          '누적 금액': totalAmount,
        };
      });

      // Sheet 2: 전체 주문 내역 DB
      const sheet2Data = (ordersData || []).map((o) => ({
        '주문 ID': o.order_id,
        '주문일자': o.order_date ? new Date(o.order_date).toLocaleString() : '-',
        '고객명': o.customers?.name || '-',
        '연락처': o.customers?.phone || '-',
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
    } catch (err) {
      console.error(err);
      alert('엑셀 다운로드 중 오류가 발생했습니다.');
    } finally {
      setExcelLoading(false);
    }
  };

  // 분류별 설정 서브 메뉴
  const SUB_TABS = [
    { id: 'dashboard',  label: '대시보드',       icon: 'dashboard' },
    { id: 'customers',  label: '회원정보',       icon: 'group' },
    { id: 'orders',     label: '주문관리',       icon: 'shopping_cart' },
    { id: 'finance',    label: '정산서 발행',     icon: 'receipt_long' },
    { id: 'employees',  label: '직원정산',       icon: 'payments' },
    { id: 'products',   label: '상품관리',       icon: 'inventory_2' },
    { id: 'settings',   label: '설정 (관리자)',    icon: 'manage_accounts' },
  ];

  return (
    <div style={{ fontFamily: "'Hanken Grotesk', 'Malgun Gothic', sans-serif", height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 타이틀 헤더 */}
      <div>
        <p style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", color: '#6d7980', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
          Live Commerce / Settings
        </p>
        <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>설정 (최고 관리자 전용)</h2>
      </div>

      {/* 설정 분류 탭 바 */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', flexWrap: 'wrap' }}>
        {SUB_TABS.map(tab => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: isActive ? 'rgba(0, 245, 212, 0.1)' : 'transparent',
                color: isActive ? 'var(--color-mint)' : 'var(--text-muted)',
                fontWeight: isActive ? 700 : 500, fontSize: '13px',
                fontFamily: "'Hanken Grotesk', sans-serif",
                transition: 'all 0.15s ease'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 탭 콘텐츠 영역 */}
      <div style={{ flex: 1 }}>
        
        {/* 1. 대시보드 관련 설정 */}
        {activeSubTab === 'dashboard' && (
          <div style={{ maxWidth: '600px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>dashboard</span>
              대시보드 설정
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', margin: 0 }}>
              대시보드의 디지털 메모장에 적어놓으신 내용은 새로고침하거나 브라우저를 껐다 켜도 안전하게 자동 보관됩니다.<br />
              현재 대시보드 컴포넌트는 Supabase의 실시간 통계 요약 및 캘린더 일별 매출 조회를 제공하고 있습니다.
            </p>
          </div>
        )}

        {/* 2. 회원정보 관련 설정 */}
        {activeSubTab === 'customers' && (
          <div style={{ maxWidth: '600px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>group</span>
              회원정보 설정
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '8px' }}>
              회원정보 탭에서 닉네임과 상세 정보(실명, 전화번호, 주소)를 일치하여 등록해두면 주문 등록 시 자동 완성 기능을 사용해 빠르고 안전하게 입력할 수 있습니다.
            </p>
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
              <h5 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>통합 데이터 백업</h5>
              <button
                onClick={handleExcelDownload}
                disabled={excelLoading}
                className="btn btn-secondary"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '10px 16px',
                  background: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
                {excelLoading ? '엑셀 생성 중...' : '전체 회원 및 주문내역 엑셀 다운로드'}
              </button>
            </div>
          </div>
        )}

        {/* 3. 주문관리 관련 설정 */}
        {activeSubTab === 'orders' && (
          <div style={{ maxWidth: '600px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>shopping_cart</span>
              주문관리 설정 안내
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', margin: 0 }}>
              주문 관리에서 수동 등록을 진행할 때, 입력한 닉네임 및 물품명이 각각 '회원정보'와 '상품관리'에 존재해야만 주문을 추가할 수 있도록 안전한 락(Lock) 기능이 기본 설정되어 있습니다.
            </p>
          </div>
        )}

        {/* 4. 정산서 발행 관련 설정 */}
        {activeSubTab === 'finance' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '24px' }}>
            
            {/* 정산서 계좌번호 설정 */}
            <div style={{ gridColumn: 'span 6', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>account_balance</span>
                정산서 계좌번호 설정
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>정산서 발행 계좌번호</label>
                <input
                  type="text"
                  value={bankInfo}
                  onChange={(e) => setBankInfo(e.target.value)}
                  style={{ 
                    width: '100%', padding: '10px 14px', 
                    border: '1px solid var(--border-color)', borderRadius: '8px', 
                    fontSize: '13px', outline: 'none', 
                    background: 'var(--bg-main)', color: 'var(--text-primary)',
                    fontFamily: "'Hanken Grotesk', sans-serif"
                  }}
                  placeholder="예: 신한은행 110-456-789012 (예금주: 스마트주스토어)"
                />
              </div>

              <button
                onClick={handleSaveBankInfo}
                style={{ 
                  padding: '12px', background: 'var(--color-mint)', color: '#ffffff', 
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, 
                  cursor: 'pointer', fontFamily: "'Hanken Grotesk', sans-serif"
                }}
              >
                계좌번호 저장
              </button>
            </div>

            {/* 인보이스 글자 크기 설정 */}
            <div style={{ gridColumn: 'span 6', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>format_size</span>
                인보이스 글자 크기 설정
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>글자 크기 조절 (모바일 카카오톡 공유/캡처 가독성)</label>
                <select
                  value={invoiceFontSize}
                  onChange={(e) => setInvoiceFontSize(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px',
                    border: '1px solid var(--border-color)', borderRadius: '8px',
                    fontSize: '13px', outline: 'none',
                    background: 'var(--bg-main)', color: 'var(--text-primary)',
                    fontFamily: "'Hanken Grotesk', sans-serif",
                    cursor: 'pointer'
                  }}
                >
                  <option value="12">작게 (12px)</option>
                  <option value="14">보통 (14px)</option>
                  <option value="16">크게 (16px)</option>
                  <option value="18">아주 크게 (18px)</option>
                  <option value="20">최대 크기 (20px)</option>
                </select>
              </div>

              <button
                onClick={handleSaveFontSize}
                style={{ 
                  padding: '12px', background: 'var(--color-mint)', color: '#ffffff', 
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, 
                  cursor: 'pointer', fontFamily: "'Hanken Grotesk', sans-serif"
                }}
              >
                글자 크기 저장
              </button>
            </div>

          </div>
        )}

        {/* 5. 직원정산 관련 설정 */}
        {activeSubTab === 'employees' && (
          <div style={{ maxWidth: '600px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>payments</span>
              직원정산 관리 안내
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', margin: 0 }}>
              각 직원의 기본 시급 및 근무 시간 이력을 안전하게 보관 및 집계합니다. 시급 및 추가 인센티브는 직원 관리 화면에서 즉각 수정 및 정산 상태 변경이 가능합니다.
            </p>
          </div>
        )}

        {/* 6. 상품관리 관련 설정 */}
        {activeSubTab === 'products' && (
          <div style={{ maxWidth: '600px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>inventory_2</span>
              상품관리 안내
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', margin: 0 }}>
              상품 탭에 등록된 공식 상품 목록만 주문 관리에서 물품명 자동완성을 지원하며 정밀 정산에 활용됩니다. 상품을 추가하거나 가격을 수정하면 실시간 연계됩니다.
            </p>
          </div>
        )}

        {/* 7. 설정 (관리자 비밀번호 및 계정 생성/삭제) */}
        {activeSubTab === 'settings' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '24px' }}>
            
            {/* 최고 관리자 비밀번호 변경 란 */}
            <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>lock_reset</span>
                  내 비밀번호 변경
                </h4>
                <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>새 비밀번호</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      style={{ 
                        width: '100%', padding: '10px 14px', 
                        border: '1px solid var(--border-color)', borderRadius: '8px', 
                        fontSize: '13px', outline: 'none', 
                        background: 'var(--bg-main)', color: 'var(--text-primary)'
                      }}
                      placeholder="새 비밀번호 입력"
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>새 비밀번호 확인</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      style={{ 
                        width: '100%', padding: '10px 14px', 
                        border: '1px solid var(--border-color)', borderRadius: '8px', 
                        fontSize: '13px', outline: 'none', 
                        background: 'var(--bg-main)', color: 'var(--text-primary)'
                      }}
                      placeholder="새 비밀번호 다시 입력"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={pwLoading}
                    style={{ 
                      padding: '12px', background: '#006688', color: '#ffffff', 
                      border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, 
                      cursor: 'pointer', fontFamily: "'Hanken Grotesk', sans-serif",
                      opacity: pwLoading ? 0.7 : 1
                    }}
                  >
                    {pwLoading ? '변경 중...' : '비밀번호 변경'}
                  </button>
                </form>
              </div>
            </div>

            {/* 관리자 계정 생성 란 */}
            <div style={{ gridColumn: 'span 4' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>person_add</span>
                  관리자 계정 생성
                </h4>
                <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>관리자 아이디</label>
                    <input
                      type="text"
                      value={newAdminUser}
                      onChange={(e) => setNewAdminUser(e.target.value)}
                      style={{ 
                        width: '100%', padding: '10px 14px', 
                        border: '1px solid var(--border-color)', borderRadius: '8px', 
                        fontSize: '13px', outline: 'none', 
                        background: 'var(--bg-main)', color: 'var(--text-primary)'
                      }}
                      placeholder="예: admin2"
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>비밀번호</label>
                    <input
                      type="password"
                      value={newAdminPw}
                      onChange={(e) => setNewAdminPw(e.target.value)}
                      style={{ 
                        width: '100%', padding: '10px 14px', 
                        border: '1px solid var(--border-color)', borderRadius: '8px', 
                        fontSize: '13px', outline: 'none', 
                        background: 'var(--bg-main)', color: 'var(--text-primary)'
                      }}
                      placeholder="비밀번호 설정"
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>이름 (사용자 실명)</label>
                    <input
                      type="text"
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      style={{ 
                        width: '100%', padding: '10px 14px', 
                        border: '1px solid var(--border-color)', borderRadius: '8px', 
                        fontSize: '13px', outline: 'none', 
                        background: 'var(--bg-main)', color: 'var(--text-primary)'
                      }}
                      placeholder="예: 홍길동"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={createLoading}
                    style={{ 
                      padding: '12px', background: 'var(--color-mint)', color: '#ffffff', 
                      border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, 
                      cursor: 'pointer', fontFamily: "'Hanken Grotesk', sans-serif",
                      opacity: createLoading ? 0.7 : 1
                    }}
                  >
                    {createLoading ? '생성 중...' : '신규 관리자 추가'}
                  </button>
                </form>
              </div>
            </div>

            {/* 관리자 목록 및 삭제 기능 */}
            <div style={{ gridColumn: 'span 4' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '300px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>shield_person</span>
                  관리자 계정 목록
                </h4>
                
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {listLoading ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>불러오는 중...</div>
                  ) : (
                    <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '8px 10px', fontSize: '11px', textAlign: 'left' }}>이름 (ID)</th>
                          <th style={{ padding: '8px 10px', fontSize: '11px', textAlign: 'center', width: '50px' }}>삭제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminList.filter(admin => admin.username !== 'admin').map(admin => {
                          const isSelf = admin.id === user.id;
                          const canDelete = !isSelf;

                          return (
                            <tr key={admin.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '10px 8px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{admin.name}</div>
                                <div style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>{admin.username}</div>
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                {canDelete ? (
                                  <button
                                    onClick={() => handleDeleteAdmin(admin.id, admin.username)}
                                    style={{
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      border: 'none',
                                      color: 'var(--color-danger)',
                                      borderRadius: '6px',
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      cursor: 'pointer',
                                      fontWeight: 600,
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    삭제
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
