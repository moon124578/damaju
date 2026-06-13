import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const MENU_ITEMS = [
  { id: 'dashboard',  label: '대시보드',       icon: 'dashboard' },
  { id: 'customers',  label: '회원정보',       icon: 'group' },
  { id: 'orders',     label: '주문 관리',       icon: 'receipt_long' },
  { id: 'finance',    label: '정산서 발행',     icon: 'receipt_long' },
  { id: 'shipping',   label: '배송 관리',       icon: 'local_shipping' },
  { id: 'employees',  label: '직원 정산',       icon: 'payments' },
  { id: 'products',   label: '상품 관리',       icon: 'inventory_2' },
  { id: 'stats',      label: '통계',           icon: 'query_stats' },
  { id: 'settings',   label: '설정',           icon: 'settings' },
];

export default function Sidebar({ activeTab, setActiveTab, user, onLogout, isMobile, sidebarOpen, setSidebarOpen }) {
  const [notes, setNotes] = useState([]);
  const [copiedNoteId, setCopiedNoteId] = useState(null);

  const fetchNotes = async () => {
    const username = user?.username || 'admin';
    try {
      const { data, error } = await supabase
        .from('dashboard_notes')
        .select('*')
        .eq('username', username)
        .order('id', { ascending: true });
      if (error) throw error;
      if (data) {
        setNotes(data.filter(n => n.text && n.text.trim() !== ''));
      } else {
        setNotes([]);
      }
    } catch (e) {
      setNotes([]);
    }
  };

  useEffect(() => {
    fetchNotes();
    const interval = setInterval(fetchNotes, 1500);
    return () => {
      clearInterval(interval);
    };
  }, [activeTab, user]);

  const handleCopyText = (note) => {
    navigator.clipboard.writeText(note.text);
    setCopiedNoteId(note.id);
    setTimeout(() => {
      setCopiedNoteId(null);
    }, 1500);
  };

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
        {MENU_ITEMS.filter(item => (item.id !== 'settings' && item.id !== 'employees') || user?.username === 'admin').map(item => {
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

        {/* 빠른 메모 복사 영역 */}
        {notes.length > 0 && (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '12px 4px' }} />
            <div style={{ padding: '0 4px 4px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-mint)' }}>note_alt</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>📌 빠른 메모 복사</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0 4px' }}>
              {notes.map(note => {
                const colors = {
                  yellow: { bg: 'rgba(255, 243, 191, 0.15)', border: '#fcc419' },
                  mint: { bg: 'rgba(211, 249, 216, 0.15)', border: '#51cf66' },
                  pink: { bg: 'rgba(255, 219, 240, 0.15)', border: '#f783ac' },
                  blue: { bg: 'rgba(208, 235, 255, 0.15)', border: '#4dabf7' },
                  orange: { bg: 'rgba(255, 224, 204, 0.15)', border: '#ff922b' }
                };
                const cStyle = colors[note.color] || colors.yellow;
                const singleLineText = note.text.replace(/\s+/g, ' ').trim();
                const isCopied = copiedNoteId === note.id;

                return (
                  <div
                    key={note.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: cStyle.bg,
                      borderLeft: `3px solid ${cStyle.border}`,
                      fontSize: '12px',
                      transition: 'all 0.2s ease',
                      gap: '8px'
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text-primary)',
                        fontFamily: 'sans-serif'
                      }}
                      title={note.text}
                    >
                      {singleLineText}
                    </span>
                    <button
                      onClick={() => handleCopyText(note)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        color: isCopied ? '#006b5c' : '#6d7980',
                        fontSize: '10px',
                        fontWeight: 700,
                        transition: 'all 0.15s ease'
                      }}
                      title="클립보드에 복사"
                    >
                      {isCopied ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
                          복사됨
                        </span>
                      ) : (
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>content_copy</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
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
