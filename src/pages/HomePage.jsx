import React from 'react';
import { BarChart3, Trophy, Users } from 'lucide-react';
import { SeasonLinks } from '../components/SiteLayout';

export default function HomePage() {
  return <>
    <section className="logo-hero label-hero">
      <div className="logo-hero-glow" />
      <p className="eyebrow">HM LABEL DATA ARCHIVE</p>
      <div className="hero-wordmark" aria-label="HM LABEL">HM<span>LABEL</span></div>
      <h1>후원의 기록을 한눈에.</h1>
      <p className="hero-description">시즌별 후원 내역부터 멤버별 통계까지.<br />HM레이블의 모든 기록을 확인하세요.</p>
      <div className="hero-features"><span><Users size={16} />멤버별 집계</span><span><Trophy size={16} />후원자 순위</span><span><BarChart3 size={16} />시간별 통계</span></div>
    </section>
    <section className="season-selection" aria-labelledby="season-heading">
      <div className="season-heading"><div><p className="eyebrow">SEASONS</p><h2 id="season-heading">어떤 시즌을 살펴볼까요?</h2></div><p>시즌을 선택해 데이터를 조회하세요.</p></div>
      <SeasonLinks cards />
    </section>
    <p className="archive-note">각 시즌의 데이터는 독립적으로 조회됩니다.</p>
  </>;
}
