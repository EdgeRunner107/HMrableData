import React from 'react';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { LabelLogo, SeasonLinks } from '../components/SiteLayout';

export default function HomePage() {
  return <main className="page"><section className="mobile">
    <header className="header">
      <div><p className="eyebrow">HM LABEL</p><h1>HM레이블</h1></div>
      <Link className="header-icon" to="/admin" aria-label="운영자 페이지"><Settings size={18} /></Link>
    </header>
    <LabelLogo />
    <section className="filter-panel scope-panel">
      <h2 className="scope-title">HM레이블</h2>
      <p className="label">시즌 선택</p>
      <SeasonLinks />
    </section>
  </section></main>;
}
