import React, { useState } from 'react';

export default function Settings({ theme, setTheme }) {
  const [bankInfo, setBankInfo] = useState(
    localStorage.getItem('bank_account_info') || '신한은행 110-456-789012 (예금주: 스마트주스토어)'
  );

  const handleBankInfoSave = () => {
    localStorage.setItem('bank_account_info', bankInfo);
    // 현재 열려 있는 탭 중 하나인 정산서 탭에서도 변경사항을 바로 읽을 수 있게 커스텀 이벤트를 발생시킵니다.
    window.dispatchEvent(new Event('bank_info_changed'));
    alert('계좌번호가 성공적으로 저장되었습니다.');
  };

  return (
    <div style={{ fontFamily: "'Hanken Grotesk', 'Malgun Gothic', sans-serif", height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <p style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", color: '#6d7980', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
          Live Commerce / Settings
        </p>
        <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>설정</h2>
      </div>

      <div className="grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '16px' }}>
        {/* 테마 설정 */}
        <div style={{ gridColumn: 'span 6', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>palette</span>
            테마 설정 (다크 / 화이트 모드)
          </h4>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setTheme('light')}
              style={{
                flex: 1, padding: '16px 12px', borderRadius: '8px', 
                border: `2px solid ${theme === 'light' ? 'var(--color-mint)' : 'var(--border-color)'}`,
                background: theme === 'light' ? 'rgba(14, 165, 233, 0.08)' : 'var(--bg-main)', 
                color: theme === 'light' ? 'var(--color-mint)' : 'var(--text-primary)',
                fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                fontFamily: "'Hanken Grotesk', sans-serif"
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>light_mode</span>
              화이트 모드
            </button>
            <button
              onClick={() => setTheme('dark')}
              style={{
                flex: 1, padding: '16px 12px', borderRadius: '8px', 
                border: `2px solid ${theme === 'dark' ? 'var(--color-mint)' : 'var(--border-color)'}`,
                background: theme === 'dark' ? 'rgba(56, 189, 248, 0.08)' : 'var(--bg-main)', 
                color: theme === 'dark' ? 'var(--color-mint)' : 'var(--text-primary)',
                fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                fontFamily: "'Hanken Grotesk', sans-serif"
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>dark_mode</span>
              다크 모드
            </button>
          </div>
        </div>

        {/* 정산서 계좌번호 설정 */}
        <div style={{ gridColumn: 'span 6', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)' }}>account_balance</span>
            정산서 계좌번호 설정
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="text"
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
              style={{ 
                width: '100%', padding: '12px 14px', 
                border: '1px solid var(--border-color)', borderRadius: '8px', 
                fontSize: '14px', outline: 'none', 
                background: 'var(--bg-main)', color: 'var(--text-primary)',
                fontFamily: "'Hanken Grotesk', sans-serif"
              }}
              placeholder="예: 신한은행 110-456-789012 (예금주: 스마트주스토어)"
            />
            <button
              onClick={handleBankInfoSave}
              style={{ 
                padding: '12px', background: 'var(--color-mint)', color: '#ffffff', 
                border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, 
                cursor: 'pointer', fontFamily: "'Hanken Grotesk', sans-serif",
                transition: 'background-color 0.2s'
              }}
            >
              저장하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
