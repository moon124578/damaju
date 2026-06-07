import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { matchChosung } from '../hangulSearch';

export default function Products({ onDataChange }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // 모달 제어 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    purchase_price: 0,
    selling_price: 0,
    stock_qty: 0,
  });

  // 재고 조정 모달
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockFormData, setStockFormData] = useState({ id: null, name: '', qty: 0 });

  // 수동 거래 모달 (매출 / 매입)
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txType, setTxType] = useState('sale'); // 'sale' or 'purchase'
  const [txFormData, setTxFormData] = useState({ id: null, name: '', price: 0, qty: 1 });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async (searchVal = search) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });
        
      if (error) throw error;
      
      let filteredData = data || [];
      if (searchVal.trim()) {
        filteredData = filteredData.filter(prod => matchChosung(prod.name, searchVal));
      }
      
      setProducts(filteredData);
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    fetchProducts(val);
  };

  const openAddModal = () => {
    setSelectedProduct(null);
    setFormData({
      name: '',
      purchase_price: 0,
      selling_price: 0,
      stock_qty: 0,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (prod) => {
    setSelectedProduct(prod);
    setFormData({
      name: prod.name,
      purchase_price: prod.purchase_price,
      selling_price: prod.selling_price,
      stock_qty: prod.stock_qty,
    });
    setIsModalOpen(true);
  };

  const openStockModal = (prod) => {
    setStockFormData({
      id: prod.id,
      name: prod.name,
      qty: prod.stock_qty,
    });
    setIsStockModalOpen(true);
  };

  const openTxModal = (prod, type) => {
    setTxType(type);
    setTxFormData({
      id: prod.id,
      name: prod.name,
      price: type === 'sale' ? prod.selling_price : prod.purchase_price,
      qty: 1,
    });
    setIsTxModalOpen(true);
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('상품명은 필수 항목입니다.');
      return;
    }

    try {
      if (selectedProduct) {
        // 수정
        const { error } = await supabase
          .from('products')
          .update({
            name: formData.name.trim(),
            purchase_price: Number(formData.purchase_price),
            selling_price: Number(formData.selling_price),
            stock_qty: Number(formData.stock_qty),
          })
          .eq('id', selectedProduct.id);
        if (error) throw error;
      } else {
        // 신규 등록
        const { error } = await supabase.from('products').insert([
          {
            name: formData.name.trim(),
            category: '의류',
            purchase_price: Number(formData.purchase_price),
            selling_price: Number(formData.selling_price),
            stock_qty: Number(formData.stock_qty),
          },
        ]);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchProducts();
      onDataChange();
    } catch (err) {
      console.error(err);
      alert('상품 저장 중 오류가 발생했습니다.');
    }
  };

  const handleStockSubmit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('products')
        .update({ stock_qty: Number(stockFormData.qty) })
        .eq('id', stockFormData.id);

      if (error) throw error;
      setIsStockModalOpen(false);
      fetchProducts();
      onDataChange();
    } catch (err) {
      console.error(err);
      alert('재고 조정 중 오류가 발생했습니다.');
    }
  };

  const handleTxSubmit = async (e) => {
    e.preventDefault();
    const qty = Number(txFormData.qty);
    const prodId = txFormData.id;
    const price = Number(txFormData.price);
    const todayStr = new Date().toISOString().substring(0, 10);

    try {
      // 1. 재고 체크 (매출 시)
      const { data: prod } = await supabase
        .from('products')
        .select('stock_qty')
        .eq('id', prodId)
        .single();

      if (txType === 'sale' && prod.stock_qty < qty) {
        alert(`재고가 부족합니다. (현재 재고: ${prod.stock_qty}개)`);
        return;
      }

      // 2. 거래 기록 등록 및 재고 변동
      if (txType === 'sale') {
        const { error: saleErr } = await supabase.from('sales').insert([
          { product_id: prodId, quantity: qty, selling_price: price, sale_date: todayStr },
        ]);
        if (saleErr) throw saleErr;

        const { error: updErr } = await supabase
          .from('products')
          .update({ stock_qty: prod.stock_qty - qty })
          .eq('id', prodId);
        if (updErr) throw updErr;
      } else {
        const { error: purErr } = await supabase.from('purchases').insert([
          { product_id: prodId, quantity: qty, purchase_price: price, purchase_date: todayStr },
        ]);
        if (purErr) throw purErr;

        const { error: updErr } = await supabase
          .from('products')
          .update({ stock_qty: prod.stock_qty + qty })
          .eq('id', prodId);
        if (updErr) throw updErr;
      }

      setIsTxModalOpen(false);
      fetchProducts();
      onDataChange();
      alert(txType === 'sale' ? '매출이 정상 등록되었습니다.' : '매입 입고가 완료되었습니다.');
    } catch (err) {
      console.error(err);
      alert('거래 등록 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (prod) => {
    if (!window.confirm(`상품 '${prod.name}'을 삭제하시겠습니까?\n(매출/매입 내역에는 영향이 없거나 '삭제된 상품'으로 표기됩니다.)`)) {
      return;
    }

    try {
      const { error } = await supabase.from('products').delete().eq('id', prod.id);
      if (error) throw error;
      fetchProducts();
      onDataChange();
    } catch (err) {
      console.error(err);
      alert('상품 삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="content-area">
      <div className="content-header">
        <h1 className="content-title">상품 및 재고 관리</h1>
      </div>

      <div className="search-bar">
        <input
          type="text"
          className="input-control"
          placeholder="상품명 검색..."
          value={search}
          onChange={handleSearchChange}
        />
        <button className="btn btn-secondary" onClick={() => fetchProducts()}>
          검색
        </button>
        <button className="btn btn-primary" onClick={openAddModal}>
          신규 상품 등록
        </button>
      </div>

      <span style={{ color: 'var(--color-danger)', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>
        * 재고 수량 10개 이하: 붉은색 표시 (발주 권장)
      </span>

      <div className="table-container">
        {loading ? (
          <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>로딩 중...</p>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>상품명</th>
                <th>매입가</th>
                <th>판매가</th>
                <th style={{ textAlign: 'right' }}>재고수량</th>
                <th style={{ width: '280px', textAlign: 'center' }}>업무 지원</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                    등록된 상품이 없습니다.
                  </td>
                </tr>
              ) : (
                products.map((prod) => {
                  const isLow = prod.stock_qty <= 10;
                  return (
                    <tr
                      key={prod.id}
                      className={isLow ? 'warning-row' : ''}
                      onDoubleClick={() => openEditModal(prod)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{prod.id}</td>
                      <td style={{ fontWeight: '600' }}>{prod.name}</td>
                      <td>₩ {prod.purchase_price.toLocaleString()}</td>
                      <td>₩ {prod.selling_price.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: isLow ? 'var(--color-danger)' : 'inherit' }}>
                        {prod.stock_qty.toLocaleString()} 개
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => openTxModal(prod, 'sale')}>
                            매출
                          </button>
                          <button
                            className="btn"
                            style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: 'var(--color-blue)', color: '#0f0f11' }}
                            onClick={() => openTxModal(prod, 'purchase')}
                          >
                            입고
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => openStockModal(prod)}>
                            재고조정
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => openEditModal(prod)}>
                            수정
                          </button>
                          <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => handleDelete(prod)}>
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 1. 상품 등록/수정 모달 */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {selectedProduct ? '상품 정보 수정' : '신규 상품 등록'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleProductSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>상품명 *</label>
                  <input
                    type="text"
                    className="input-control"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>매입가 (원) *</label>
                  <input
                    type="number"
                    className="input-control"
                    value={formData.purchase_price}
                    onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                    min="0"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>판매가 (원) *</label>
                  <input
                    type="number"
                    className="input-control"
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                    min="0"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>초기 재고수량 (개)</label>
                  <input
                    type="number"
                    className="input-control"
                    value={formData.stock_qty}
                    onChange={(e) => setFormData({ ...formData, stock_qty: e.target.value })}
                    min="0"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
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

      {/* 2. 재고 조정 모달 */}
      {isStockModalOpen && (
        <div className="modal-overlay" onClick={() => setIsStockModalOpen(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ width: '350px' }}>
            <div className="modal-header">
              <h3 className="modal-title">재고 강제 조정</h3>
              <button onClick={() => setIsStockModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}>
                &times;
              </button>
            </div>
            <form onSubmit={handleStockSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>상품명</label>
                  <div style={{ color: 'var(--color-mint)', fontWeight: 'bold' }}>{stockFormData.name}</div>
                </div>
                <div className="form-group">
                  <label>변경할 재고수량</label>
                  <input
                    type="number"
                    className="input-control"
                    value={stockFormData.qty}
                    onChange={(e) => setStockFormData({ ...stockFormData, qty: e.target.value })}
                    min="0"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsStockModalOpen(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
                  적용
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. 매출 / 매입 수동 등록 모달 */}
      {isTxModalOpen && (
        <div className="modal-overlay" onClick={() => setIsTxModalOpen(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ width: '360px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {txType === 'sale' ? '매출 수동 등록' : '매입 입고 등록'}
              </h3>
              <button onClick={() => setIsTxModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}>
                &times;
              </button>
            </div>
            <form onSubmit={handleTxSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>상품명</label>
                  <div style={{ color: txType === 'sale' ? 'var(--color-mint)' : 'var(--color-blue)', fontWeight: 'bold' }}>
                    {txFormData.name}
                  </div>
                </div>
                <div className="form-group">
                  <label>{txType === 'sale' ? '판매 단가' : '매입 단가'}</label>
                  <div style={{ fontWeight: '500' }}>₩ {txFormData.price.toLocaleString()}</div>
                </div>
                <div className="form-group">
                  <label>{txType === 'sale' ? '판매 수량 (개)' : '입고 수량 (개)'}</label>
                  <input
                    type="number"
                    className="input-control"
                    value={txFormData.qty}
                    onChange={(e) => setTxFormData({ ...txFormData, qty: e.target.value })}
                    min="1"
                    required
                  />
                </div>
                <div className="form-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                  <label>총 예상 금액</label>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    ₩ {(txFormData.price * txFormData.qty).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsTxModalOpen(false)}>
                  취소
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{
                    backgroundColor: txType === 'sale' ? 'var(--color-mint)' : 'var(--color-blue)',
                    color: '#0f0f11',
                  }}
                >
                  {txType === 'sale' ? '판매 등록' : '입고 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
