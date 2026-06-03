import React, { useState, useEffect } from 'react';
import './App.css';

// 컴포넌트 임포트
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Customers from './components/Customers';
import Orders from './components/Orders';
import Products from './components/Products';
import Employees from './components/Employees';
import Finance from './components/Finance';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  // 모바일 및 사이드바 제어 상태
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobileMode = window.innerWidth <= 1024;
      setIsMobile(mobileMode);
      if (!mobileMode) {
        setSidebarOpen(false); // 데스크톱 복귀 시 닫기
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setActiveTab('dashboard');
  };

  const triggerRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  // 로그인되지 않은 경우 로그인 창 표시
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container" style={{ flexDirection: 'column' }}>
      {/* 모바일 탑 헤더 */}
      {isMobile && (
        <header style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '60px',
          background: '#ffffff', borderBottom: '1px solid #bcc8d1',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', zIndex: 40, boxSizing: 'border-box'
        }}>
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px', color: '#006688' }}>
              {sidebarOpen ? 'close' : 'menu'}
            </span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/damaju_logo.png" alt="damaju logo" style={{ height: '32px', objectFit: 'contain' }} />
          </div>
          <button
            onClick={handleLogout}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px', color: '#ba1a1a' }}
            title="로그아웃"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>logout</span>
          </button>
        </header>
      )}

      {/* 좌측/모바일 오버레이 사이드바 */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (isMobile) setSidebarOpen(false); // 탭 이동 시 닫기
        }}
        user={user}
        onLogout={handleLogout}
        isMobile={isMobile}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* 모바일 사이드바 오픈 시 배경 딤 처리 */}
      {isMobile && sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0, 0, 0, 0.4)', zIndex: 45
          }}
        />
      )}

      {/* 우측 메인 콘텐츠 뷰 영역 */}
      <div
        className="content-area"
        key={refreshKey}
        style={{
          marginLeft: isMobile ? '0' : '240px',
          paddingTop: isMobile ? '60px' : '0',
          overflowY: activeTab === 'dashboard' && !isMobile ? 'hidden' : 'auto',
          background: '#f9f9ff',
          padding: activeTab === 'dashboard' ? '0' : (isMobile ? '16px' : '32px'),
          boxSizing: 'border-box',
          minWidth: 0,
          flex: 1
        }}
      >
        <div style={{ padding: isMobile && activeTab === 'dashboard' ? '16px' : '0', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'customers' && <Customers onDataChange={triggerRefresh} />}
          {activeTab === 'orders' && <Orders onDataChange={triggerRefresh} />}
          {activeTab === 'products' && <Products onDataChange={triggerRefresh} />}
          {activeTab === 'employees' && <Employees onDataChange={triggerRefresh} />}
          {activeTab === 'finance' && <Finance onDataChange={triggerRefresh} />}
        </div>
      </div>
    </div>
  );
}
