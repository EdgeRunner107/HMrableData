import React from 'react';
export default function TablePager({ label, count, page, onChange }) {
  if (count <= 100) return null;
  const last = Math.ceil(count / 100) - 1;
  return <nav className="table-pagination" aria-label={label}>
    <button className="secondary-button" disabled={page === 0} onClick={() => onChange(0)}>처음</button>
    <button className="secondary-button" disabled={page === 0} onClick={() => onChange(page - 1)}>이전</button>
    <span>{page + 1} / {last + 1} 페이지 · 전체 {count.toLocaleString()}건</span>
    <button className="secondary-button" disabled={page >= last} onClick={() => onChange(page + 1)}>다음</button>
    <button className="secondary-button" disabled={page >= last} onClick={() => onChange(last)}>마지막</button>
  </nav>;
}
