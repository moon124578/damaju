import React from 'react';

const MENU_ITEMS = [
  { id: 'dashboard',  label: '대시보드',       icon: 'dashboard' },
  { id: 'customers',  label: '회원정보',       icon: 'group' },
  { id: 'orders',     label: '주문 관리',       icon: 'receipt_long' },
  { id: 'finance',    label: '정산서 발행',     icon: 'receipt_long' },
  { id: 'employees',  label: '직원 정산',       icon: 'payments' },
  { id: 'products',   label: '상품 관리',       icon: 'inventory_2' },
  { id: 'settings',   label: '설정',           icon: 'settings' },
];

export default function Sidebar({ activeTab, setActiveTab, user, onLogout, isMobile, sidebarOpen, setSidebarOpen }) {
  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, height: '100%', width: '240px',
      background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-color)',
      display: 'flex', flexDirection: 'column',
      padding: '24px 0', gap: '16px', zIndex: 50,
      fontFamily: "'Hanken Grotesk', 'Malgun Gothic', sans-serif",
      transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-240px)') : 'translateX(0)',
      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      {/* 로고 */}
      <div style={{ padding: '0 24px 8px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{
          width: '180px',
          height: '180px',
          borderRadius: '50%',
          border: '2px solid #bcc8d1',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#ffffff'
        }}>
          <img 
            src="/damaju_logo.png" 
            alt="damaju logo" 
            style={{ 
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scale(1.23)',
            }} 
          />
        </div>
      </div>

      {/* 네비게이션 */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 12px' }}>
        {MENU_ITEMS.filter(item => item.id !== 'settings' || user?.username === 'admin').map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 12px', borderRadius: '8px',
                border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
                background: isActive ? '#f0f3ff' : 'transparent',
                color: isActive ? '#006688' : '#3d484f',
                fontWeight: isActive ? 700 : 400,
                fontSize: '14px',
                fontFamily: "'Hanken Grotesk', 'Malgun Gothic', sans-serif",
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '20px',
                  fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                  color: isActive ? '#006688' : '#6d7980',
                }}
              >
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* 사용자 푸터 */}
      <div style={{
        marginTop: 'auto', padding: '16px 24px 0',
        borderTop: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: '#68fadd', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 700, color: '#004c66', flexShrink: 0,
        }}>
          {(user?.name || '관리자').charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name || '관리자'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>시스템 관리자</div>
        </div>
        <button
          onClick={onLogout}
          title="로그아웃"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#6d7980' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
        </button>
      </div>
    </aside>
  );
}
