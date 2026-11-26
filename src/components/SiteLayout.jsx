import React from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { BarChart3, ChevronDown, FlaskConical } from 'lucide-react';
import { LIVE_API_ENABLED, PREVIEW_MODE, SEASON_OPTIONS, previewState } from '../config/site';

export function SeasonLinks({ cards = false }) {
  const { search } = useLocation();
  return <nav className={`choice-buttons season-buttons ${cards ? 'season-cards' : ''}`} aria-label="시즌 선택">
    {SEASON_OPTIONS.map(season => <NavLink key={season.id} to={`/season/${season.id}${search}`}
      className={cards ? 'filter-panel season-card' : 'secondary-button'}>
      {cards && <span className="season-card-icon"><BarChart3 size={22} aria-hidden="true" /></span>}
      <span>{season.title}</span>
      {cards && <><p>후원 내역과 통계</p><span className="season-card-action">데이터 조회</span></>}
    </NavLink>)}
  </nav>;
}

export default function SiteLayout({ children }) {
  const [params, setParams] = useSearchParams();
  const { search } = useLocation();
  return <div className="label-app">
    <a href="#main-content" className="skip-link">본문으로 이동</a>
    <header className="site-header"><div className="site-header-inner">
      <Link className="brand-area" to={`/${search}`} aria-label="HM레이블 홈">
        <span className="logo-box text-logo" aria-hidden="true">HM</span>
        <span className="brand-copy"><strong>HM LABEL</strong><span>HM레이블 데이터</span></span>
      </Link><Link className="header-tag" to="/admin">관리자</Link>
    </div></header>
    <div className="label-container">
      {PREVIEW_MODE ? <aside className="preview-banner" aria-label="개발 프리뷰 안내">
        <FlaskConical size={19} aria-hidden="true" />
        <div><strong>프리뷰 모드 · 테스트 데이터</strong><p>가상의 멤버와 후원 내역입니다. 실제 HM레이블 데이터가 아닙니다.</p></div>
        <label className="preview-control"><span>화면 상태</span><span className="select-box">
          <select aria-label="프리뷰 화면 상태" value={previewState()} onChange={event => {
            const next = new URLSearchParams(params);
            if (event.target.value === 'ready') next.delete('previewState');
            else next.set('previewState', event.target.value);
            setParams(next);
          }}><option value="ready">정상 데이터</option><option value="empty">빈 데이터</option><option value="loading">로딩</option><option value="error">오류</option></select>
          <ChevronDown size={14} aria-hidden="true" /></span></label>
      </aside> : <aside className="connection-banner">{LIVE_API_ENABLED ? 'HM레이블 후원 데이터 조회' : 'HM레이블 데이터 연결을 준비 중입니다.'}</aside>}
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="site-footer"><strong>HM LABEL</strong><span>HM레이블 · 후원 데이터 아카이브</span>{PREVIEW_MODE && <span>개발용 프리뷰</span>}</footer>
    </div>
  </div>;
}
