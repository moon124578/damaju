import React from 'react';

export default function Sidebar({ activeTab, setActiveTab, user, onLogout }) {
  const menus = [
    { name: '대시보드', id: 'dashboard' },
    { name: '고객 정보 관리', id: 'customers' },
    { name: '상품 및 재고 관리', id: 'products' },
    { name: '직원 및 급여 정산', id: 'employees' },
    { name: '매출 및 순수익 통계', id: 'finance' },
  ];

  return (
    <div className="sidebar">
      <h2 className="sidebar-title">STORE ADMIN</h2>
      
      <div className="sidebar-menu">
        {menus.map((menu) => (
          <button
            key={menu.id}
            className={`menu-item ${activeTab === menu.id ? 'active' : ''}`}
            onClick={() => setActiveTab(menu.id)}
          >
            {menu.name}
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="user-tag">
          접속자: {user?.name || '관리자'} 님
        </div>
        <button className="btn-logout" onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </div>
  );
}
