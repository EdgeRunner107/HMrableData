import React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PREVIEW_MODE, SEASON_OPTIONS, previewState } from '../config/site';

export function SeasonLinks() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return <nav className="choice-buttons season-buttons" aria-label="시즌 선택">
    {SEASON_OPTIONS.map(season => <button key={season.id} type="button" className="secondary-button"
      aria-pressed={pathname === `/season/${season.id}`}
      onClick={() => navigate(`/season/${season.id}${search}`)}>{season.title}</button>)}
  </nav>;
}

export function LabelLogo({ subtitle = false }) {
  return <section className="logo-hero">
    <div className="logo-hero-glow" />
    <img src="/logo.jpg" alt="HM레이블" className="hero-logo" />
    <div className="hero-title">HM레이블</div>
    {subtitle && <div className="hero-subtitle">HM레이블 점수 조회</div>}
  </section>;
}

export default function SiteLayout({ children }) {
  const [params, setParams] = useSearchParams();
  return <>
    {PREVIEW_MODE && <aside className="notice preview-banner" aria-label="개발 프리뷰 안내">
      <strong>프리뷰 모드 · 테스트 데이터</strong>
      <label>화면 상태 <select aria-label="프리뷰 화면 상태" value={previewState()} onChange={event => {
        const next = new URLSearchParams(params);
        if (event.target.value === 'ready') next.delete('previewState');
        else next.set('previewState', event.target.value);
        setParams(next);
      }}><option value="ready">정상 데이터</option><option value="empty">빈 데이터</option><option value="loading">로딩</option><option value="error">오류</option></select></label>
    </aside>}
    {children}
  </>;
}
