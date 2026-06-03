import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Customers({ onDataChange }) {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  // 모달 관련 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null); // null 이면 신규 추가
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    grade: '일반',
    notes: '',
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async (searchVal = search) => {
    setLoading(true);
    try {
      let query = supabase.from('customers').select('*');
      
      if (searchVal.trim()) {
        query = query.or(`name.ilike.%${searchVal}%,contact.ilike.%${searchVal}%`);
      }
      
      const { data, error } = await query.order('id', { ascending: false });
      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    fetchCustomers(e.target.value);
  };

  const openAddModal = () => {
    setSelectedCustomer(null);
    setFormData({
      name: '',
      contact: '',
      grade: '일반',
      notes: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (cust) => {
    setSelectedCustomer(cust);
    setFormData({
      name: cust.name,
      contact: cust.contact || '',
      grade: cust.grade || '일반',
      notes: cust.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('고객 이름은 필수 항목입니다.');
      return;
    }

    try {
      if (selectedCustomer) {
        // 수정
        const { error } = await supabase
          .from('customers')
          .update({
            name: formData.name.trim(),
            contact: formData.contact.trim(),
            grade: formData.grade,
            notes: formData.notes.trim(),
          })
          .eq('id', selectedCustomer.id);
        if (error) throw error;
      } else {
        // 신규 등록
        const { error } = await supabase
          .from('customers')
          .insert([
            {
              name: formData.name.trim(),
              contact: formData.contact.trim(),
              grade: formData.grade,
              notes: formData.notes.trim(),
            },
          ]);
        if (error) throw error;
      }
      
      setIsModalOpen(false);
      fetchCustomers();
      onDataChange();
    } catch (err) {
      console.error('Error saving customer:', err);
      alert('고객 정보를 저장하는 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (cust) => {
    if (!window.confirm(`고객 '${cust.name}' 정보를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const { error } = await supabase.from('customers').delete().eq('id', cust.id);
      if (error) throw error;
      fetchCustomers();
      onDataChange();
    } catch (err) {
      console.error('Error deleting customer:', err);
      alert('고객 삭제 처리 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="content-area">
      <div className="content-header">
        <h1 className="content-title">고객 정보 관리</h1>
      </div>

      <div className="search-bar">
        <input
          type="text"
          className="input-control"
          placeholder="고객 이름 또는 연락처 검색..."
          value={search}
          onChange={handleSearchChange}
        />
        <button className="btn btn-secondary" onClick={() => fetchCustomers()}>
          검색
        </button>
        <button className="btn btn-primary" onClick={openAddModal}>
          신규 고객 등록
        </button>
      </div>

      <div className="table-container">
        {loading ? (
          <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>로딩 중...</p>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>고객명</th>
                <th>연락처</th>
                <th>등급</th>
                <th>메모</th>
                <th style={{ width: '150px' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                    등록된 고객이 없습니다.
                  </td>
                </tr>
              ) : (
                customers.map((cust) => (
                  <tr key={cust.id} onDoubleClick={() => openEditModal(cust)} style={{ cursor: 'pointer' }}>
                    <td>{cust.id}</td>
                    <td style={{ fontWeight: '600' }}>{cust.name}</td>
                    <td>{cust.contact || '-'}</td>
                    <td>
                      <span
                        className={`status-tag ${
                          cust.grade === 'VIP' || cust.grade === 'Gold' ? 'settled' : 'unsettled'
                        }`}
                      >
                        {cust.grade}
                      </span>
                    </td>
                    <td>{cust.notes || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => openEditModal(cust)}>
                          수정
                        </button>
                        <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handleDelete(cust)}>
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

      {/* 고객 등록/수정 모달 */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {selectedCustomer ? '고객 정보 수정' : '신규 고객 등록'}
              </h3>
              <button
                onClick={handleCloseModal}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>이름 *</label>
                  <input
                    type="text"
                    className="input-control"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>연락처</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="010-XXXX-XXXX"
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>등급</label>
                  <select
                    className="input-control"
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  >
                    <option value="일반">일반</option>
                    <option value="Silver">Silver</option>
                    <option value="Gold">Gold</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>메모</label>
                  <textarea
                    className="input-control"
                    rows="3"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
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
