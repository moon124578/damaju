import React, { useState } from 'react';
import { supabase } from '../supabase';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Supabase users 테이블에서 관리자 계정 조회
      const { data, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username.trim())
        .eq('password', password.trim())
        .eq('role', 'admin')
        .single();

      if (dbError || !data) {
        setError('아이디 또는 비밀번호가 일치하지 않거나, 관리자 권한이 없습니다.');
      } else {
        onLoginSuccess(data);
      }
    } catch (err) {
      console.error(err);
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card glass-card">
        <h1 className="login-title">STORE MANAGER</h1>
        <p className="login-subtitle">관리자 계정으로 로그인해 주세요.</p>
        
        {error && (
          <div style={{ color: 'var(--color-danger)', fontSize: '12px', textAlign: 'center', backgroundColor: 'var(--color-danger-bg)', padding: '8px', borderRadius: '4px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <input
              type="text"
              className="input-control"
              placeholder="관리자 ID (기본: admin)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              style={{ height: '42px' }}
            />
          </div>
          <div className="form-group">
            <input
              type="password"
              className="input-control"
              placeholder="비밀번호 (기본: admin123)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              style={{ height: '42px' }}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ height: '45px', marginTop: '10px' }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
