import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabase';

// ── KPI 카드 ─────────────────────────────────────────────────────
function KpiCard({ title, value, unit, sub, icon, iconColor, trendText, trendColor, trendIcon }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 60); }, []);
  return (
    <div className="metric-card glass-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span className="metric-title">{title}</span>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: iconColor + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ color: iconColor, fontSize: '18px' }}>{icon}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(6px)', transition: 'all 0.4s ease' }}>
        <span className="metric-value" style={{ color: '#151c27' }}>{value}</span>
        <span style={{ fontSize: '14px', color: '#64748b' }}>{unit}</span>
      </div>
      {sub && <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', color: '#64748b', display: 'block', marginTop: '2px' }}>{sub}</span>}
      {trendText && (
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: trendColor }}>
          <span className="material-symbols-outlined" style={{ fontSize: '14px', color: trendColor }}>{trendIcon}</span>
          <span>{trendText}</span>
        </div>
      )}
    </div>
  );
}

// ── 메인 대시보드 ────────────────────────────────────────────────
export default function Dashboard({ user }) {
  const username = user?.username || 'admin';
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [orders, setOrders] = useState([]);
  const [metrics, setMetrics] = useState({
    monthlySalesAmount: 0,
    monthlySalesCount: 0,
    monthlyCancelCount: 0,
    monthlyRefundCount: 0,
    todaySalesAmount: 0,
    todaySalesCount: 0,
    todayCancelCount: 0,
    todayRefundCount: 0,
  });

  // 디지털 메모장(포스트잇) 상태 및 ref
  const [notes, setNotes] = useState([]);
  const notesRef = useRef([]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const boardRef = useRef(null);

  useEffect(() => {
    fetchData();
    fetchNotes();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().substring(0, 10);
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select(`order_id, product_name, quantity, total_price, order_date, order_status, customer_id, customers (nickname, name), staffs (staff_name)`)
        .order('order_id', { ascending: false });
      if (error) throw error;
      const list = ordersData || [];
      setOrders(list);

      // 이번 달 주문 필터
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      const monthOrders = list.filter(o => {
        if (!o.order_date) return false;
        const d = new Date(o.order_date);
        return d.getFullYear() === curYear && d.getMonth() === curMonth;
      });
      const monthSales = monthOrders.filter(o => o.order_status !== '주문 취소' && o.order_status !== '환불 완료');

      const today = list.filter(o => o.order_date?.substring(0, 10) === todayStr);
      const todaySales = today.filter(o => o.order_status !== '주문 취소' && o.order_status !== '환불 완료');

      setMetrics({
        monthlySalesAmount: monthSales.reduce((s, o) => s + o.total_price, 0),
        monthlySalesCount: monthSales.reduce((s, o) => s + o.quantity, 0),
        monthlyCancelCount: monthOrders.filter(o => o.order_status === '주문 취소').length,
        monthlyRefundCount: monthOrders.filter(o => o.order_status === '환불 완료').length,
        todaySalesAmount: todaySales.reduce((s, o) => s + o.total_price, 0),
        todaySalesCount: todaySales.reduce((s, o) => s + o.quantity, 0),
        todayCancelCount: today.filter(o => o.order_status === '주문 취소').length,
        todayRefundCount: today.filter(o => o.order_status === '환불 완료').length,
      });
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('dashboard_notes')
        .select('*')
        .eq('username', username)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setNotes(data);
      } else {
        // 기본 2개 메모 자동 생성
        const defaultNotes = [
          {
            id: Date.now(),
            username: username,
            text: "환영합니다!\n\n1. 메모지는 상단 헤더를 잡아 드래그로 이동할 수 있습니다.\n2. 우측 하단 모서리를 드래그해 크기를 변경합니다.\n3. 메모 영역 밖으로는 나갈 수 없게 제한되어 있습니다.\n4. 새로고침해도 메모 위치와 내용이 그대로 유지됩니다.",
            color: "yellow",
            x: 20,
            y: 40,
            w: 220,
            h: 180,
            sort_order: 1
          },
          {
            id: Date.now() + 1,
            username: username,
            text: "중요 공지:\n금주 주말 재고 실사 예정\n(재고 부족 품목 우선 발주 요망)",
            color: "mint",
            x: 260,
            y: 120,
            w: 200,
            h: 140,
            sort_order: 2
          }
        ];
        
        const { error: insErr } = await supabase
          .from('dashboard_notes')
          .insert(defaultNotes);
          
        if (insErr) throw insErr;
        setNotes(defaultNotes);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  };

  // 캘린더 생성 관련 로직
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // 포스트잇 기능 구현
  const addStickyNote = async () => {
    const nextOrder = notes.length > 0 ? Math.max(...notes.map(n => n.sort_order || 0)) + 1 : 1;
    const newNote = {
      id: Date.now(),
      username: username,
      text: '',
      color: 'yellow',
      x: 40,
      y: 40,
      w: 180,
      h: 140,
      sort_order: nextOrder
    };
    try {
      const { error } = await supabase
        .from('dashboard_notes')
        .insert([newNote]);
      if (error) throw error;
      setNotes(prev => [...prev, newNote]);
    } catch (err) {
      console.error(err);
      alert('메모 생성에 실패했습니다.');
    }
  };

  const deleteStickyNote = async (noteId) => {
    try {
      const { error } = await supabase
        .from('dashboard_notes')
        .delete()
        .eq('id', noteId);
      if (error) throw error;
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      console.error(err);
      alert('메모 삭제에 실패했습니다.');
    }
  };

  const debounceTimers = useRef({});

  const updateNoteText = (noteId, text) => {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, text } : n));

    if (debounceTimers.current[noteId]) {
      clearTimeout(debounceTimers.current[noteId]);
    }
    
    debounceTimers.current[noteId] = setTimeout(async () => {
      try {
        await supabase
          .from('dashboard_notes')
          .update({ text })
          .eq('id', noteId);
      } catch (err) {
        console.error('Text sync error:', err);
      }
      delete debounceTimers.current[noteId];
    }, 800);
  };

  const changeNoteColor = async (noteId, color) => {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, color } : n));
    try {
      const { error } = await supabase
        .from('dashboard_notes')
        .update({ color })
        .eq('id', noteId);
      if (error) throw error;
    } catch (err) {
      console.error(err);
    }
  };

  // 포스트잇 드래그 이동 핸들러
  const handleMouseDownNote = (e, noteId) => {
    if (e.button !== 0) return; // 좌클릭만 허용
    if (e.target.closest('.btn-delete-note') || e.target.closest('.color-dot') || e.target.closest('.resize-handle')) return;

    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startNoteX = note.x;
    const startNoteY = note.y;

    const handleMouseMove = (moveEvent) => {
      if (!boardRef.current) return;
      const boardRect = boardRef.current.getBoundingClientRect();
      
      let newX = startNoteX + (moveEvent.clientX - startX);
      let newY = startNoteY + (moveEvent.clientY - startY);

      newX = Math.max(0, Math.min(newX, boardRect.width - note.w));
      newY = Math.max(0, Math.min(newY, boardRect.height - note.h));

      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, x: newX, y: newY } : n));
    };

    const handleMouseUp = async () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      const finalNote = notesRef.current.find(n => n.id === noteId);
      if (finalNote) {
        try {
          await supabase
            .from('dashboard_notes')
            .update({ x: finalNote.x, y: finalNote.y })
            .eq('id', noteId);
        } catch (err) {
          console.error(err);
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // 포스트잇 리사이즈 핸들러
  const handleMouseDownResize = (e, noteId) => {
    e.stopPropagation();
    e.preventDefault();

    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = note.w;
    const startH = note.h;

    const handleMouseMove = (moveEvent) => {
      if (!boardRef.current) return;
      const boardRect = boardRef.current.getBoundingClientRect();

      let newW = startW + (moveEvent.clientX - startX);
      let newH = startH + (moveEvent.clientY - startY);

      newW = Math.max(120, newW);
      newH = Math.max(100, newH);

      newW = Math.min(newW, boardRect.width - note.x);
      newH = Math.min(newH, boardRect.height - note.y);

      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, w: newW, h: newH } : n));
    };

    const handleMouseUp = async () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      const finalNote = notesRef.current.find(n => n.id === noteId);
      if (finalNote) {
        try {
          await supabase
            .from('dashboard_notes')
            .update({ w: finalNote.w, h: finalNote.h })
            .eq('id', noteId);
        } catch (err) {
          console.error(err);
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const colorMap = {
    yellow: { bg: 'rgba(255, 243, 191, 0.95)', border: '#fcc419' },
    mint: { bg: 'rgba(211, 249, 216, 0.95)', border: '#51cf66' },
    pink: { bg: 'rgba(255, 219, 240, 0.95)', border: '#f783ac' },
    blue: { bg: 'rgba(208, 235, 255, 0.95)', border: '#4dabf7' },
    orange: { bg: 'rgba(255, 224, 204, 0.95)', border: '#ff922b' }
  };

  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const totalDays = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const blanks = Array(firstDay).fill(null);
    const days = Array.from({ length: totalDays }, (_, i) => i + 1);

    const allDays = [...blanks, ...days];

    // 날짜별 주문 매핑
    const getOrdersForDay = (dayNum) => {
      if (!dayNum) return [];
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      return orders.filter(o => o.order_date?.substring(0, 10) === dateStr);
    };

    return (
      <div className="calendar-grid">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div key={d} className="calendar-day-header" style={{ color: i === 0 ? 'var(--color-danger)' : i === 6 ? 'var(--color-blue)' : 'var(--text-muted)' }}>
            {d}
          </div>
        ))}
        {allDays.map((day, idx) => {
          if (day === null) {
            return <div key={`blank-${idx}`} className="calendar-day-cell" style={{ background: 'transparent', border: 'none' }} />;
          }

          const dayOrders = getOrdersForDay(day);
          const salesTotal = dayOrders.filter(o => o.order_status !== '주문 취소' && o.order_status !== '환불 완료').reduce((s, o) => s + o.total_price, 0);
          const refundCount = dayOrders.filter(o => o.order_status === '환불 완료').length;
          const cancelCount = dayOrders.filter(o => o.order_status === '주문 취소').length;
          const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;

          return (
            <div
              key={`day-${day}`}
              className={`calendar-day-cell active-day ${isToday ? 'today' : ''}`}
            >
              <span className="calendar-day-num">{day}</span>
              {dayOrders.length > 0 && (
                <div className="calendar-day-data">
                  <span className="calendar-sales-count">주문 {dayOrders.length}건</span>
                  <span className="calendar-sales-amount" style={{ fontSize: '13px', opacity: 0.85 }}>
                    ₩{salesTotal.toLocaleString()}
                  </span>
                  {(refundCount > 0 || cancelCount > 0) && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                      {cancelCount > 0 && (
                        <span style={{ fontSize: '10px', color: '#ef4444', background: '#fef2f2', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>
                          취소 {cancelCount}
                        </span>
                      )}
                      {refundCount > 0 && (
                        <span style={{ fontSize: '10px', color: '#ba1a1a', background: '#fff5f5', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>
                          환불 {refundCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
      <div className="db-spinner" />
      <span style={{ color: '#6d7980', fontSize: '14px' }}>데이터 로딩 중...</span>
    </div>
  );

  return (
    <div className="content-area" style={{ padding: '32px' }}>
      {/* 상단 헤더 */}
      <header className="content-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="content-title">대시보드 요약</h1>
        <button className="btn btn-secondary" onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>refresh</span>
          새로고침
        </button>
      </header>

      <section className="metrics-grid">
        <KpiCard
          title="월 판매"
          value={`₩${metrics.monthlySalesAmount.toLocaleString()}`}
          unit=""
          sub={`${metrics.monthlySalesCount.toLocaleString()}개 판매`}
          icon="payments"
          iconColor="#0ea5e9"
        />
        <KpiCard
          title="월 취소/환불"
          value={metrics.monthlyCancelCount + metrics.monthlyRefundCount}
          unit="건"
          sub={`취소 ${metrics.monthlyCancelCount} | 환불 ${metrics.monthlyRefundCount}`}
          icon="sync_problem"
          iconColor="#ef4444"
        />
        <KpiCard
          title="오늘 판매"
          value={`₩${metrics.todaySalesAmount.toLocaleString()}`}
          unit=""
          sub={`${metrics.todaySalesCount.toLocaleString()}개 판매`}
          icon="shopping_bag"
          iconColor="#f97316"
        />
        <KpiCard
          title="오늘 취소/환불"
          value={metrics.todayCancelCount + metrics.todayRefundCount}
          unit="건"
          sub={`취소 ${metrics.todayCancelCount} | 환불 ${metrics.todayRefundCount}`}
          icon="cancel"
          iconColor="#ba1a1a"
        />
      </section>

      {/* 메인 레이아웃 스택 (달력 하단에 디지털 메모판 배치) */}
      <div className="dashboard-layout-stacked">
        
        {/* 달력 섹션 */}
        <div className="calendar-container glass-card">
          <div className="calendar-header">
            <div className="calendar-title-wrapper">
              <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)', fontSize: '20px' }}>calendar_month</span>
              <h2>담아쥬 캘린더</h2>
            </div>
            <div className="calendar-nav">
              <button className="calendar-btn" onClick={handlePrevMonth}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_left</span>
              </button>
              <span className="calendar-month-text">
                {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
              </span>
              <button className="calendar-btn" onClick={handleNextMonth}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
              </button>
            </div>
          </div>
          {renderCalendar()}
        </div>

        {/* 디지털 메모장 보드 */}
        <div className="memo-board-container">
          <div className="memo-board-header">
            <div className="memo-board-title">
              <span className="material-symbols-outlined" style={{ color: 'var(--color-mint)', fontSize: '20px' }}>note_alt</span>
              <span>디지털 메모장</span>
            </div>
            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={addStickyNote}>
              + 포스트잇 추가
            </button>
          </div>

          <div className="memo-board" ref={boardRef}>
            {notes.map((note) => {
              const style = colorMap[note.color] || colorMap.yellow;
              return (
                <div
                  key={note.id}
                  className="sticky-note"
                  style={{
                    left: `${note.x}px`,
                    top: `${note.y}px`,
                    width: `${note.w}px`,
                    height: `${note.h}px`,
                    backgroundColor: style.bg,
                    borderLeft: `5px solid ${style.border}`
                  }}
                  onMouseDown={(e) => handleMouseDownNote(e, note.id)}
                >
                  {/* 메모 상단 드래그 헤더 */}
                  <div className="sticky-note-header">
                    <span>MEMO</span>
                    <button className="btn-delete-note" onClick={() => deleteStickyNote(note.id)} title="메모 삭제">×</button>
                  </div>
                  
                  {/* 메모 작성 바디 */}
                  <div className="sticky-note-content-wrapper">
                    <textarea
                      className="sticky-note-textarea"
                      placeholder="내용을 입력하세요..."
                      value={note.text}
                      onChange={(e) => updateNoteText(note.id, e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()} // 텍스트 영역 드래그 방지
                    />
                  </div>

                  {/* 메모 하단 색상 선택기 */}
                  <div className="sticky-note-footer" onMouseDown={(e) => e.stopPropagation()}>
                    <div className="color-dots">
                      {Object.keys(colorMap).map((colorKey) => (
                        <div
                          key={colorKey}
                          className="color-dot"
                          style={{ backgroundColor: colorMap[colorKey].bg }}
                          onClick={() => changeNoteColor(note.id, colorKey)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* 우측 하단 크기 조절기 */}
                  <div
                    className="resize-handle"
                    onMouseDown={(e) => handleMouseDownResize(e, note.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}


