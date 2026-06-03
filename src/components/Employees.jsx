import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Employees({ onDataChange }) {
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [workRecords, setWorkRecords] = useState([]);
  const [payrollHistory, setPayrollHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  // 조회 기준 월 목록 생성 (최근 6개월)
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');

  // 직원 관리 모달
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [empModalData, setEmpModalData] = useState(null); // null 이면 신규 등록
  const [empFormData, setEmpFormData] = useState({
    name: '',
    position: '알바',
    salary_type: '시급',
    base_salary: 0,
  });

  // 근무 기록 폼
  const [workFormData, setWorkFormData] = useState({
    date: new Date().toISOString().substring(0, 10),
    hours: 8,
    notes: '',
  });

  useEffect(() => {
    // 최근 6개월 데이터 세팅
    const generatedMonths = [];
    const localDate = new Date();
    const currentYear = localDate.getFullYear();
    const currentMonth = localDate.getMonth() + 1;
    for (let i = 0; i < 6; i++) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }
      generatedMonths.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    setMonths(generatedMonths);
    setSelectedMonth(generatedMonths[0]);

    fetchEmployees();
  }, []);

  useEffect(() => {
    if (selectedEmp && selectedMonth) {
      fetchEmployeeDetails();
    } else {
      setWorkRecords([]);
      setPayrollHistory(null);
    }
  }, [selectedEmp, selectedMonth]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('employees').select('*').order('id', { ascending: true });
      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeeDetails = async () => {
    if (!selectedEmp || !selectedMonth) return;
    try {
      // 1. 근무 기록 조회
      const { data: records, error: recErr } = await supabase
        .from('work_records')
        .select('*')
        .eq('employee_id', selectedEmp.id)
        .like('work_date', `${selectedMonth}%`)
        .order('work_date', { ascending: false });

      if (recErr) throw recErr;
      setWorkRecords(records || []);

      // 2. 급여 정산 이력 조회
      const { data: history, error: hisErr } = await supabase
        .from('payrolls')
        .select('*')
        .eq('employee_id', selectedEmp.id)
        .eq('settlement_month', selectedMonth)
        .maybeSingle();

      if (hisErr) throw hisErr;
      setPayrollHistory(history);
    } catch (err) {
      console.error(err);
    }
  };

  const openAddEmpModal = () => {
    setEmpModalData(null);
    setEmpFormData({
      name: '',
      position: '알바',
      salary_type: '시급',
      base_salary: 10000,
    });
    setIsEmpModalOpen(true);
  };

  const openEditEmpModal = (emp) => {
    setEmpModalData(emp);
    setEmpFormData({
      name: emp.name,
      position: emp.position,
      salary_type: emp.salary_type,
      base_salary: emp.base_salary,
    });
    setIsEmpModalOpen(true);
  };

  const handleEmpSubmit = async (e) => {
    e.preventDefault();
    if (!empFormData.name.trim()) {
      alert('직원명은 필수 항목입니다.');
      return;
    }

    try {
      if (empModalData) {
        // 수정
        const { error } = await supabase
          .from('employees')
          .update({
            name: empFormData.name.trim(),
            position: empFormData.position,
            salary_type: empFormData.salary_type,
            base_salary: Number(empFormData.base_salary),
          })
          .eq('id', empModalData.id);
        if (error) throw error;
        // 선택된 직원 데이터 정보 갱신
        if (selectedEmp && selectedEmp.id === empModalData.id) {
          setSelectedEmp({ ...selectedEmp, ...empFormData });
        }
      } else {
        // 등록
        const { error } = await supabase.from('employees').insert([
          {
            name: empFormData.name.trim(),
            position: empFormData.position,
            salary_type: empFormData.salary_type,
            base_salary: Number(empFormData.base_salary),
          },
        ]);
        if (error) throw error;
      }
      setIsEmpModalOpen(false);
      fetchEmployees();
    } catch (err) {
      console.error(err);
      alert('직원 저장 중 오류가 발생했습니다.');
    }
  };

  const handleEmpDelete = async (emp) => {
    if (!window.confirm(`직원 '${emp.name}' 정보를 삭제하시겠습니까?\n근무 및 정산 기록도 함께 일괄 삭제됩니다.`)) {
      return;
    }

    try {
      const { error } = await supabase.from('employees').delete().eq('id', emp.id);
      if (error) throw error;
      if (selectedEmp && selectedEmp.id === emp.id) {
        setSelectedEmp(null);
      }
      fetchEmployees();
      onDataChange();
    } catch (err) {
      console.error(err);
      alert('직원 삭제 중 오류가 발생했습니다.');
    }
  };

  // 근무 기록 추가
  const handleAddWorkRecord = async (e) => {
    e.preventDefault();
    if (!selectedEmp) {
      alert('직원을 먼저 선택해주세요.');
      return;
    }

    try {
      const { error } = await supabase.from('work_records').insert([
        {
          employee_id: selectedEmp.id,
          work_date: workFormData.date,
          hours_worked: Number(workFormData.hours),
          notes: workFormData.notes.trim(),
        },
      ]);
      if (error) throw error;
      
      setWorkFormData({ ...workFormData, notes: '' });
      fetchEmployeeDetails();
      onDataChange();
    } catch (err) {
      console.error(err);
      alert('근무 기록 추가 중 오류가 발생했습니다.');
    }
  };

  // 근무 기록 삭제
  const handleDeleteWorkRecord = async (recId) => {
    try {
      const { error } = await supabase.from('work_records').delete().eq('id', recId);
      if (error) throw error;
      fetchEmployeeDetails();
      onDataChange();
    } catch (err) {
      console.error(err);
      alert('근무 기록 삭제 중 오류가 발생했습니다.');
    }
  };

  // 정산 로직 최종 금액 계산
  const calculateFinalSalary = () => {
    if (!selectedEmp) return 0;
    const base = selectedEmp.base_salary;
    if (selectedEmp.salary_type === '월급') {
      return base;
    } else {
      // 시급
      const totalHours = workRecords.reduce((sum, item) => sum + item.hours_worked, 0);
      return Math.round(totalHours * base);
    }
  };

  // 정산 완료 처리 실행
  const handleSettlePayroll = async () => {
    if (!selectedEmp || !selectedMonth) return;
    const finalSal = calculateFinalSalary();
    const todayStr = new Date().toISOString().substring(0, 10);

    if (!window.confirm(`직원 '${selectedEmp.name}'의 ${selectedMonth} 급여 (₩ ${finalSal.toLocaleString()})를 정산 완료 처리하시겠습니까?`)) {
      return;
    }

    try {
      const { error } = await supabase.from('payrolls').insert([
        {
          employee_id: selectedEmp.id,
          settlement_month: selectedMonth,
          calculated_salary: finalSal,
          settlement_date: todayStr,
          status: '정산 완료',
        },
      ]);

      if (error) {
        if (error.code === '23505') { // PostgreSQL unique constraint violation error code
          alert('해당 월은 이미 급여 정산이 완료되었습니다.');
        } else {
          throw error;
        }
      } else {
        fetchEmployeeDetails();
        onDataChange();
        alert('정산 처리가 완료되었습니다.');
      }
    } catch (err) {
      console.error(err);
      alert('정산 처리 중 오류가 발생했습니다.');
    }
  };

  const totalWorkedAmount = workRecords.reduce((sum, r) => sum + r.hours_worked, 0);
  const calculatedSalary = calculateFinalSalary();

  return (
    <div className="content-area">
      <div className="content-header">
        <h1 className="content-title">직원 관리 및 급여 정산</h1>
      </div>

      <div className="splitter-container">
        {/* 좌측 패널: 직원 리스트 */}
        <div className="splitter-left glass-card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold' }}>직원 목록</h3>
            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={openAddEmpModal}>
              직원 등록
            </button>
          </div>

          <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>로딩 중...</p>
            ) : (
              <table className="custom-table" style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>직급</th>
                    <th>유형</th>
                    <th>기본급/시급</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>
                        등록된 직원이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    employees.map((emp) => (
                      <tr
                        key={emp.id}
                        onClick={() => setSelectedEmp(emp)}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: selectedEmp?.id === emp.id ? 'rgba(0, 245, 212, 0.08)' : '',
                        }}
                      >
                        <td style={{ fontWeight: 'bold' }}>{emp.name}</td>
                        <td>{emp.position}</td>
                        <td>{emp.salary_type}</td>
                        <td>₩ {emp.base_salary.toLocaleString()}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '2px 6px', fontSize: '10px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditEmpModal(emp);
                              }}
                            >
                              수정
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '2px 6px', fontSize: '10px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEmpDelete(emp);
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 우측 패널: 근무 일지 및 급여 계산기 */}
        <div className="splitter-right glass-card" style={{ padding: '16px', overflowY: 'auto' }}>
          {selectedEmp ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-mint)' }}>
                  {selectedEmp.name} {selectedEmp.position} ({selectedEmp.salary_type}) 상세
                </h3>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>정산월:</span>
                  <select
                    className="input-control"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 1. 근무기록 추가 폼 */}
              <form onSubmit={handleAddWorkRecord} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', margin: '12px 0' }}>
                <div className="form-group" style={{ flex: '2' }}>
                  <label>근무일자</label>
                  <input
                    type="date"
                    className="input-control"
                    value={workFormData.date}
                    onChange={(e) => setWorkFormData({ ...workFormData, date: e.target.value })}
                    style={{ padding: '6px 8px', fontSize: '12px' }}
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: '1.5' }}>
                  <label>{selectedEmp.salary_type === '시급' ? '시간 (Hr)' : '일수 (Day)'}</label>
                  <input
                    type="number"
                    className="input-control"
                    value={workFormData.hours}
                    onChange={(e) => setWorkFormData({ ...workFormData, hours: e.target.value })}
                    step="0.5"
                    min="0.5"
                    max="24"
                    style={{ padding: '6px 8px', fontSize: '12px' }}
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: '3' }}>
                  <label>비고/메모</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="메모 입력..."
                    value={workFormData.notes}
                    onChange={(e) => setWorkFormData({ ...workFormData, notes: e.target.value })}
                    style={{ padding: '6px 8px', fontSize: '12px' }}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '7px 12px', fontSize: '12px' }}>
                  추가
                </button>
              </form>

              {/* 근무기록 테이블 */}
              <div style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '16px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <table className="custom-table" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>{selectedEmp.salary_type === '시급' ? '근무시간' : '근무일수'}</th>
                      <th>메모</th>
                      <th style={{ width: '60px', textAlign: 'center' }}>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workRecords.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '12px' }}>
                          근무 기록이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      workRecords.map((rec) => (
                        <tr key={rec.id}>
                          <td>{rec.work_date}</td>
                          <td>{rec.hours_worked} {selectedEmp.salary_type === '시급' ? '시간' : '일'}</td>
                          <td>{rec.notes || '-'}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '2px 6px', fontSize: '10px' }}
                              onClick={() => handleDeleteWorkRecord(rec.id)}
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* 급여 정산 박스 */}
              <div className="payroll-box">
                <h4 style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '8px' }}>
                  급여 정산 결과 요약
                </h4>
                <div className="payroll-summary-grid">
                  <span className="payroll-summary-label">정산 기준:</span>
                  <span className="payroll-summary-value" style={{ color: 'var(--text-muted)' }}>
                    {selectedEmp.salary_type === '월급'
                      ? `월 고정급: ₩ ${selectedEmp.base_salary.toLocaleString()}`
                      : `시급: ₩ ${selectedEmp.base_salary.toLocaleString()}`}
                  </span>

                  <span className="payroll-summary-label">총 근무량:</span>
                  <span className="payroll-summary-value">
                    {totalWorkedAmount} {selectedEmp.salary_type === '시급' ? '시간' : '일'}
                  </span>

                  <span className="payroll-summary-label">최종 계산 급여:</span>
                  <span className="payroll-summary-value highlight">
                    ₩ {calculatedSalary.toLocaleString()}
                  </span>

                  <span className="payroll-summary-label">정산 여부:</span>
                  <span className="payroll-summary-value">
                    {payrollHistory ? (
                      <span className="status-tag settled">
                        정산 완료 ({payrollHistory.settlement_date} 지급)
                      </span>
                    ) : (
                      <span className="status-tag unsettled">미정산</span>
                    )}
                  </span>
                </div>

                {!payrollHistory ? (
                  <button
                    className="btn btn-primary"
                    onClick={handleSettlePayroll}
                    style={{ width: '100%', marginTop: '8px', padding: '10px' }}
                  >
                    이 직원 이 달의 급여 정산 완료 처리
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: '8px', padding: '10px', cursor: 'not-allowed' }}
                    disabled
                  >
                    이번 달 정산 완료됨
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              직원을 선택하면 근무 기록 및 급여 정산이 표시됩니다.
            </div>
          )}
        </div>
      </div>

      {/* 직원 등록/수정 모달 */}
      {isEmpModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEmpModalOpen(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ width: '350px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {empModalData ? '직원 정보 수정' : '신규 직원 등록'}
              </h3>
              <button onClick={() => setIsEmpModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}>
                &times;
              </button>
            </div>
            <form onSubmit={handleEmpSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>직원명 *</label>
                  <input
                    type="text"
                    className="input-control"
                    value={empFormData.name}
                    onChange={(e) => setEmpFormData({ ...empFormData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>직급</label>
                  <select
                    className="input-control"
                    value={empFormData.position}
                    onChange={(e) => setEmpFormData({ ...empFormData, position: e.target.value })}
                  >
                    <option value="알바">알바</option>
                    <option value="스태프">스태프</option>
                    <option value="매니저">매니저</option>
                    <option value="점장">점장</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>급여 유형</label>
                  <select
                    className="input-control"
                    value={empFormData.salary_type}
                    onChange={(e) => setEmpFormData({ ...empFormData, salary_type: e.target.value })}
                  >
                    <option value="시급">시급</option>
                    <option value="월급">월급</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>
                    {empFormData.salary_type === '시급' ? '기본 시급 (원) *' : '기본 월급 (원) *'}
                  </label>
                  <input
                    type="number"
                    className="input-control"
                    value={empFormData.base_salary}
                    onChange={(e) => setEmpFormData({ ...empFormData, base_salary: e.target.value })}
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEmpModalOpen(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
