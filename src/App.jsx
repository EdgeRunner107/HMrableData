import React, { lazy, Suspense, useEffect } from 'react';
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom';
import SiteLayout from './components/SiteLayout';
import HomePage from './pages/HomePage';
import ViewerPage from './pages/ViewerPage';
const AdminPage = lazy(() => import('./pages/AdminPage'));
import { SEASON_OPTIONS } from './config/site';

function SeasonPage() {
  const { seasonId } = useParams();
  const { search } = useLocation();
  const season = SEASON_OPTIONS.find(item => item.id === seasonId);
  if (!season) return <Unavailable />;
  // URL 변경 시 선택 상태를 분리하고 이전 컴포넌트의 진행 중 요청을 취소합니다.
  return <ViewerPage key={`${seasonId}:${search}`} season={season.label} />;
}

function Unavailable() {
  return <section className="filter-panel unavailable"><h1>페이지를 찾을 수 없습니다.</h1>
    <p>시즌 1, 시즌 2, 시즌 3 중에서 선택해주세요.</p>
    <Link className="secondary-button" to="/">메인으로 돌아가기</Link></section>;
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    const season = SEASON_OPTIONS.find(item => pathname === `/season/${item.id}`);
    document.title = season ? `${season.title} · HM레이블 | HM LABEL` : 'HM레이블 | HM LABEL';
    window.scrollTo(0, 0);
  }, [pathname]);
  return <SiteLayout><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/season/:seasonId" element={<SeasonPage />} />
    <Route path="/admin" element={<Suspense fallback={<div className="notice" role="status">관리자 화면을 불러오는 중입니다.</div>}><AdminPage /></Suspense>} />
    <Route path="*" element={<Unavailable />} />
  </Routes></SiteLayout>;
}
