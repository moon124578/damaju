import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { matchChosung } from '../hangulSearch';

export default function Stats() {
  const [orders, setOrders] = useState([]);
  const [staffs, setStaffs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 날짜 범위 상태 (디폴트: 최근 30일)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().substring(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().substring(0, 10);
  });
  
  // 담당자 필터 상태
  const [selectedStaffId, setSelectedStaffId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewType, setViewType] = useState('일'); // '일', '주', '월'

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // 1. 직원 목록 가져오기
      const { data: staffData, error: staffErr } = await supabase
        .from('staffs')
        .select('staff_id, staff_name')
        .order('staff_id', { ascending: true });
      if (staffErr) throw staffErr;
      setStaffs(staffData || []);

      // 2. 주문 정보 가져오기
      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .select(`
          order_id, customer_id, product_name, quantity, unit_price, total_price, order_date, order_status, staff_id,
          customers (nickname, name, phone),
          staffs (staff_name)
        `);
      if (orderErr) throw orderErr;
      setOrders(orderData || []);
    } catch (err) {
      console.error('Error fetching data for stats:', err);
      alert('통계 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 날짜 변환 헬퍼 (로컬 날짜 YYYY-MM-DD 추출)
  const getLocalDateString = (dateStr) => {
    if (!dateStr) return '';
    if (dateStr.includes(' ')) return dateStr.split(' ')[0];
    try {
      const d = new Date(dateStr);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      return dateStr.substring(0, 10);
    }
  };

  // 1. 선택한 날짜 범위 내 주문 필터링
  const dateFilteredOrders = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    
    return orders.filter(o => {
      if (!o.order_date) return false;
      const orderTime = new Date(getLocalDateString(o.order_date) + 'T12:00:00');
      return orderTime >= start && orderTime <= end;
    });
  }, [orders, startDate, endDate]);

  // 2. 담당자 필터 적용된 최종 주문 목록
  const finalFilteredOrders = useMemo(() => {
    if (selectedStaffId === 'all') return dateFilteredOrders;
    return dateFilteredOrders.filter(o => o.staff_id?.toString() === selectedStaffId);
  }, [dateFilteredOrders, selectedStaffId]);

  // 3. 상단 요약 정보 계산 (최종 필터링된 주문 기준)
  const summary = useMemo(() => {
    let salesCount = 0; // 판매건수 (배송 완료 기준)
    let salesQty = 0; // 판매수량
    let salesAmount = 0; // 판매금액

    let pendingCount = 0; // 판매전건수 (배송 대기: 배송 전, 정산서 발행, 입금 완료)
    let pendingQty = 0; // 판매전수량
    let pendingAmount = 0; // 판매전금액

    let cancelCount = 0; // 취소건수
    let cancelAmount = 0; // 취소금액

    let refundCount = 0; // 환불건수
    let refundAmount = 0; // 환불금액

    finalFilteredOrders.forEach(o => {
      if (o.order_status === '배송 완료') {
        salesCount += 1;
        salesQty += o.quantity;
        salesAmount += o.total_price;
      } else if (o.order_status === '배송 전' || o.order_status === '정산서 발행' || o.order_status === '입금 완료') {
        pendingCount += 1;
        pendingQty += o.quantity;
        pendingAmount += o.total_price;
      } else if (o.order_status === '주문 취소') {
        cancelCount += 1;
        cancelAmount += o.total_price;
      } else if (o.order_status === '환불 완료') {
        refundCount += 1;
        refundAmount += o.total_price;
      }
    });

    const realPayment = salesAmount;

    return {
      salesCount, salesQty, salesAmount,
      pendingCount, pendingQty, pendingAmount,
      cancelCount, cancelAmount,
      refundCount, refundAmount,
      realPayment
    };
  }, [finalFilteredOrders]);

  // 4. 차트용 일자별 매출 추이 데이터 생성
  const trendData = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateMap = {};

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().substring(0, 10);
      dateMap[dateStr] = { sales: 0, cancel: 0 };
    }

    finalFilteredOrders.forEach(o => {
      const dateStr = getLocalDateString(o.order_date);
      if (dateMap[dateStr]) {
        if (o.order_status === '배송 완료') {
          dateMap[dateStr].sales += o.total_price;
        } else if (o.order_status === '주문 취소' || o.order_status === '환불 완료') {
          dateMap[dateStr].cancel += o.total_price;
        }
      }
    });

    return Object.entries(dateMap).map(([date, val]) => ({
      date: date.substring(5),
      sales: val.sales,
      cancel: val.cancel
    }));
  }, [finalFilteredOrders, startDate, endDate]);

  // 5. 담당 직원별 매출 현황 TOP 10 집계
  const staffChartData = useMemo(() => {
    const map = {};
    finalFilteredOrders.forEach(o => {
      if (o.order_status !== '배송 완료') return;
      const name = o.staffs?.staff_name || '담당자 없음';
      map[name] = (map[name] || 0) + o.total_price;
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [finalFilteredOrders]);

  // 6. 인기 상품 TOP 10 집계
  const productChartData = useMemo(() => {
    const map = {};
    finalFilteredOrders.forEach(o => {
      if (o.order_status !== '배송 완료') return;
      const name = o.product_name;
      map[name] = (map[name] || 0) + o.quantity;
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [finalFilteredOrders]);

  // 7. 개별 판매 내역 표 리스트 필터링 및 매핑
  const tableData = useMemo(() => {
    return finalFilteredOrders.map(o => {
      const nickname = o.customers?.nickname || '';
      const realName = o.customers?.name || '신규 고객';
      const displayName = nickname ? `${nickname} (${realName})` : realName;
      const staffName = o.staffs?.staff_name || '담당자 없음';
      const isSales = o.order_status === '배송 완료';
      const isCancelled = o.order_status === '주문 취소' || o.order_status === '환불 완료';

      return {
        orderId: o.order_id,
        orderDate: o.order_date ? getLocalDateString(o.order_date) : '-',
        nickname: displayName,
        rawNickname: nickname || realName,
        productName: o.product_name,
        staffName,
        purchaseAmount: isSales ? o.total_price : 0,
        purchaseQty: isSales ? o.quantity : 0,
        pendingAmount: (!isSales && !isCancelled) ? o.total_price : 0,
        pendingQty: (!isSales && !isCancelled) ? o.quantity : 0,
        cancelAmount: isCancelled ? o.total_price : 0,
        cancelQty: isCancelled ? o.quantity : 0,
        orderStatus: o.order_status
      };
    });
  }, [finalFilteredOrders]);

  // 8. 리스트 검색 필터 (초성 검색 지원)
  const filteredTableData = tableData.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery;
    return (
      matchChosung(item.nickname, q) ||
      matchChosung(item.staffName, q) ||
      matchChosung(item.productName, q)
    );
  });

  const renderDonutChart = (data, totalSum, colors) => {
    if (data.length === 0 || totalSum === 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px', color: '#6d7980', fontSize: '13px' }}>
          데이터가 없습니다.
        </div>
      );
    }

    let accumulatedAngle = 0;
    const radius = 60;
    const strokeWidth = 24;
    const cx = 80;
    const cy = 80;
    const circumference = 2 * Math.PI * radius;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1 }}>
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx={cx} cy={cy} r={radius} fill="transparent" stroke="#f1f5f9" strokeWidth={strokeWidth} />
          {data.map((item, idx) => {
            const percentage = item.value / totalSum;
            const strokeLength = percentage * circumference;
            const strokeOffset = circumference - strokeLength + accumulatedAngle;
            accumulatedAngle -= strokeLength;
            const color = colors[idx % colors.length];

            return (
              <circle
                key={item.name}
                cx={cx}
                cy={cy}
                r={radius}
                fill="transparent"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${strokeLength} ${circumference - strokeLength}`}
                strokeDashoffset={strokeOffset}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
              />
            );
          })}
          <circle cx={cx} cy={cy} r={radius - strokeWidth / 2} fill="#ffffff" />
        </svg>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: '#475569', overflow: 'hidden' }}>
          {data.slice(0, 5).map((item, idx) => {
            const percentage = ((item.value / totalSum) * 100).toFixed(1);
            const color = colors[idx % colors.length];
            return (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }} title={item.name}>{item.name}</span>
                <span style={{ fontWeight: 700, marginLeft: 'auto' }}>{percentage}%</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const chartPoints = useMemo(() => {
    if (trendData.length === 0) return null;
    const maxVal = Math.max(...trendData.map(d => Math.max(d.sales, d.cancel)), 100000);
    const height = 180;
    const width = 800;
    const paddingLeft = 60;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const salesPoints = trendData.map((d, idx) => {
      const x = paddingLeft + (idx / (trendData.length - 1 || 1)) * chartWidth;
      const y = paddingTop + chartHeight - (d.sales / maxVal) * chartHeight;
      return `${x},${y}`;
    }).join(' ');

    const cancelPoints = trendData.map((d, idx) => {
      const x = paddingLeft + (idx / (trendData.length - 1 || 1)) * chartWidth;
      const y = paddingTop + chartHeight - (d.cancel / maxVal) * chartHeight;
      return `${x},${y}`;
    }).join(' ');

    return { salesPoints, cancelPoints, maxVal, width, height, paddingLeft, paddingRight, paddingTop, paddingBottom, chartWidth, chartHeight };
  }, [trendData]);

  const palette1 = ['#ff5a79', '#ff98a4', '#b6e1fc', '#ffdb70', '#e2e8f0'];
  const palette2 = ['#b38df7', '#68fadd', '#ffd0a1', '#ff5a79', '#b6e1fc', '#c8e6c9'];

  const staffTotalSum = staffChartData.reduce((sum, item) => sum + item.value, 0);
  const productTotalSum = productChartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div style={{ fontFamily: "'Hanken Grotesk', 'Malgun Gothic', sans-serif", display: 'flex', flexDirection: 'column', gap: '20px', background: '#f8fafc', padding: '20px', borderRadius: '12px' }}>
      
      {/* 상단 날짜 및 필터 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f8', paddingBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#1e293b', fontWeight: 800 }}>
            {startDate.replace(/-/g, '.')} ~ {endDate.replace(/-/g, '.')} 통계 리포트
          </h3>
          <span style={{ fontSize: '11px', color: '#6d7980' }}>- 데이터는 실시간 반영됩니다.</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          
          {/* 담당자 검색 필터 추가 */}
          <select
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #bcc8d1', borderRadius: '6px', fontSize: '12px', outline: 'none', background: '#ffffff', color: '#151c27', fontWeight: 600, cursor: 'pointer' }}
          >
            <option value="all">전체 담당자</option>
            {staffs.map(s => (
              <option key={s.staff_id} value={s.staff_id.toString()}>{s.staff_name}</option>
            ))}
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #bcc8d1', borderRadius: '6px', fontSize: '12px', outline: 'none' }}
          />
          <span style={{ fontSize: '12px', color: '#6d7980' }}>~</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #bcc8d1', borderRadius: '6px', fontSize: '12px', outline: 'none' }}
          />
          <button 
            onClick={fetchInitialData} 
            style={{ background: '#ffffff', border: '1px solid #bcc8d1', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="새로고침"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#475569' }}>refresh</span>
          </button>
        </div>
      </div>

      {/* 요약 현황 9칸 그리드 */}
      <div>
        <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', margin: '0 0 10px 0' }}>요약</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
          
          {/* Row 1: 판매 & 배송대기 기본 정보 */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>판매건수</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{summary.salesCount} 건</span>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>판매수량</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{summary.salesQty} 개</span>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#006b5c', fontWeight: 600 }}>판매금액 (입금완료액)</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#006b5c' }}>{summary.salesAmount.toLocaleString()} 원</span>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#006688', fontWeight: 600 }}>실결제금액 (입금완료액)</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#006688' }}>{summary.realPayment.toLocaleString()} 원</span>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#e65100', fontWeight: 600 }}>판매전 건수 (배송대기)</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#e65100' }}>{summary.pendingCount} 건</span>
          </div>

          {/* Row 2: 대기금액, 취소 및 환불 정보 */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#e65100', fontWeight: 600 }}>판매전금액 (배송대기액)</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#e65100' }}>{summary.pendingAmount.toLocaleString()} 원</span>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#ba1a1a', fontWeight: 600 }}>취소 건수</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#ba1a1a' }}>{summary.cancelCount} 건</span>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#ba1a1a', fontWeight: 600 }}>취소 금액</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#ba1a1a' }}>{summary.cancelAmount.toLocaleString()} 원</span>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#6d7980', fontWeight: 600 }}>환불 건수</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#475569' }}>{summary.refundCount} 건</span>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#6d7980', fontWeight: 600 }}>환불 금액</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#475569' }}>{summary.refundAmount.toLocaleString()} 원</span>
          </div>

        </div>
      </div>

      {/* 매출 현황 라인 차트 영역 */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>매출 현황 (입금완료 vs 취소)</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['월', '주', '일'].map(t => (
              <button 
                key={t}
                onClick={() => setViewType(t)}
                style={{
                  padding: '4px 10px', fontSize: '11px', border: '1px solid #bcc8d1', borderRadius: '4px',
                  background: viewType === t ? '#475569' : '#ffffff', color: viewType === t ? '#ffffff' : '#475569',
                  cursor: 'pointer', fontWeight: 600
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {trendData.length > 0 && chartPoints ? (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg width="100%" height="200" viewBox="0 0 800 200" preserveAspectRatio="none">
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = chartPoints.paddingTop + chartPoints.chartHeight * ratio;
                const val = Math.round(chartPoints.maxVal * (1 - ratio));
                return (
                  <g key={idx}>
                    <line x1="60" y1={y} x2="780" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                    <text x="50" y={y + 4} fontSize="9" textAnchor="end" fill="#6d7980" fontFamily="monospace">
                      {val.toLocaleString()}
                    </text>
                  </g>
                );
              })}

              {trendData.map((d, idx) => {
                const showLabel = trendData.length <= 15 || idx % Math.ceil(trendData.length / 10) === 0;
                if (!showLabel) return null;
                const x = chartPoints.paddingLeft + (idx / (trendData.length - 1 || 1)) * chartPoints.chartWidth;
                return (
                  <text key={idx} x={x} y="192" fontSize="9" textAnchor="middle" fill="#6d7980">
                    {d.date}
                  </text>
                );
              })}

              <polyline
                fill="none"
                stroke="#ff5a79"
                strokeWidth="2.5"
                points={chartPoints.salesPoints}
              />
              
              <polyline
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2"
                strokeDasharray="4 4"
                points={chartPoints.cancelPoints}
              />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '11px', marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '3px', background: '#ff5a79', display: 'inline-block' }} />
                <span>매출 (입금완료)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '3px', background: '#94a3b8', borderTop: '1px dashed #ffffff', display: 'inline-block' }} />
                <span>취소</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6d7980', fontSize: '13px' }}>
            이 기간 동안의 매출 추이 데이터가 없습니다.
          </div>
        )}
      </div>

      {/* 하단 2분할 도넛 차트 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        
        {/* 담당자별 매출 순위 */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>담당자별 매출 순위 TOP 10 (입금완료액 기준)</h4>
          {renderDonutChart(staffChartData, staffTotalSum, palette1)}
        </div>

        {/* 인기 상품 TOP 10 */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', margin: '0 0 16px 0' }}>인기 상품 TOP 10 (입금완료 수량 기준)</h4>
          {renderDonutChart(productChartData, productTotalSum, palette2)}
        </div>

      </div>

      {/* 개별 상세 거래 내역 리스트 표 및 검색 기능 */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>상세 내역 리스트 ({filteredTableData.length}건)</span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px', width: '260px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#6d7980' }}>search</span>
            <input
              type="text"
              placeholder="고객명, 상품명, 담당자 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: '12px', outline: 'none', width: '100%', fontFamily: "'Hanken Grotesk', sans-serif" }}
            />
          </div>
        </div>

        {/* 내역 테이블 */}
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>주문일자</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>닉네임 (실명)</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>상품명</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>담당자</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700, textAlign: 'right', color: '#006b5c' }}>판매 금액</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700, textAlign: 'center', color: '#006b5c' }}>판매 수량</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700, textAlign: 'right', color: '#e65100' }}>판매전 금액</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700, textAlign: 'center', color: '#e65100' }}>판매전 수량</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700, textAlign: 'right', color: '#ba1a1a' }}>취소 금액</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700, textAlign: 'center', color: '#ba1a1a' }}>취소 수량</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '30px', color: '#6d7980' }}>데이터 로딩 중...</td>
                </tr>
              ) : filteredTableData.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '30px', color: '#6d7980' }}>조건에 맞는 거래 데이터가 없습니다.</td>
                </tr>
              ) : (
                filteredTableData.map(item => (
                  <tr key={item.orderId} style={{ borderBottom: '1px solid #e2e8f8', opacity: item.orderStatus === '주문 취소' ? 0.65 : 1 }}>
                    <td style={{ padding: '10px 14px', color: '#475569', fontFamily: 'monospace' }}>{item.orderDate}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1e293b' }}>{item.nickname}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#334155' }}>{item.productName}</td>
                    <td style={{ padding: '10px 14px', color: '#475569' }}>{item.staffName}</td>
                    
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#006b5c', fontWeight: 700 }}>
                      {item.purchaseAmount > 0 ? `₩${item.purchaseAmount.toLocaleString()}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#006b5c', fontWeight: 700 }}>
                      {item.purchaseQty > 0 ? `${item.purchaseQty}개` : '-'}
                    </td>

                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#e65100', fontWeight: 700 }}>
                      {item.pendingAmount > 0 ? `₩${item.pendingAmount.toLocaleString()}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#e65100', fontWeight: 700 }}>
                      {item.pendingQty > 0 ? `${item.pendingQty}개` : '-'}
                    </td>

                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#ba1a1a', fontWeight: 700 }}>
                      {item.cancelAmount > 0 ? `₩${item.cancelAmount.toLocaleString()}` : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#ba1a1a', fontWeight: 700 }}>
                      {item.cancelQty > 0 ? `${item.cancelQty}개` : '-'}
                    </td>

                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: '10px', padding: '2px 8px', borderRadius: '999px', fontWeight: 700,
                        color: item.orderStatus === '입금 완료' ? '#006b5c' : item.orderStatus === '주문 취소' ? '#ba1a1a' : '#e65100',
                        background: (item.orderStatus === '입금 완료' ? '#006b5c' : item.orderStatus === '주문 취소' ? '#ba1a1a' : '#e65100') + '15'
                      }}>
                        {item.orderStatus}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
