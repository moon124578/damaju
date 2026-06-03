import React, { useState } from 'react';
import './App.css';

// 컴포넌트 임포트
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Customers from './components/Customers';
import Products from './components/Products';
import Employees from './components/Employees';
import Finance from './components/Finance';

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setActiveTab('dashboard');
  };

  const triggerRefresh = () => {
    // 하위 컴포넌트에서 데이터가 변경되었을 때 전체 리프레시 상태를 동기화하기 위한 용도
    setRefreshKey((prev) => prev + 1);
  };

  // 로그인되지 않은 경우 로그인 창 표시
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      {/* 좌측 고정 사이드바 */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
      />

      {/* 우측 메인 콘텐츠 뷰 영역 (refreshKey를 주어 탭 이동시/데이터 변경시 리렌더링 트리거 가능) */}
      <div className="content-area" key={refreshKey}>
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'customers' && <Customers onDataChange={triggerRefresh} />}
        {activeTab === 'products' && <Products onDataChange={triggerRefresh} />}
        {activeTab === 'employees' && <Employees onDataChange={triggerRefresh} />}
        {activeTab === 'finance' && <Finance />}
      </div>
    </div>
  );
}
