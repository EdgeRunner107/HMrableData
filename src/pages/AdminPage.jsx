import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, FileSpreadsheet, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { SEASONS, UPLOAD_ROUNDS as ROUNDS } from '../newDataConfig';
import { PREVIEW_MODE } from '../config/site';
import { getAdminSession, loginAdmin, logoutAdmin, subscribeAdminSession } from '../api/adminAuth';
import { parseExcel } from '../api/excel';
import { fetchDonations } from '../api/donations';
import { uploadDonations } from '../api/uploads';

export default function AdminPage() {
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedRound, setSelectedRound] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [previewData, setPreviewData] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [uploadResult, setUploadResult] = useState(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [existing, setExisting] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [session, setSession] = useState(getAdminSession);
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [authError, setAuthError] = useState('');
  const [sentRows, setSentRows] = useState(0);
  const canUpload = !!session && !PREVIEW_MODE;
  const generation = useRef(0);
  const lock = useRef(false);
  const hasScope = SEASONS.includes(selectedSeason) && ROUNDS.includes(selectedRound);
  const scopeLabel = `HM레이블 / ${selectedSeason} / ${selectedRound}`;
  useEffect(() => subscribeAdminSession(setSession), []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(logoutAdmin, Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [session]);
  const handleLogin = async event => {
    event.preventDefault();
    if (loggingIn) return;
    setLoggingIn(true); setAuthError('');
    try { await loginAdmin(password); }
    catch (error) { setAuthError(error.message); }
    finally { setPassword(''); setLoggingIn(false); }
  };

  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    setExisting(null);
    if (!hasScope) return;
    const controller = new AbortController();
    let active = true;
    fetchDonations(selectedSeason, selectedRound, controller.signal)
      .then(response => { if (active) setExisting({ count: response.data.count }); })
      .catch(error => { if (active) setExisting({ error: error.message }); });
    return () => { active = false; controller.abort(); };
  }, [selectedSeason, selectedRound, refresh]);

  const resetUpload = () => {
    generation.current++;
    setParsing(false);
    setSelectedFileName('');
    setPreviewData([]);
    setAnalysis(null);
    setUploadResult(null);
    setSentRows(0);
    setPreviewPage(0);
    setStatus({ type: '', message: '' });
    const input = document.getElementById('excel-upload');
    if (input) input.value = '';
  };

  const handleFileChange = async event => {
    const file = event.target.files?.[0];
    if (!file || !hasScope || lock.current) return;
    resetUpload();
    const current = generation.current;
    setSelectedFileName(file.name);
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      if (current !== generation.current) return;
      const result = parseExcel(buffer, { season: selectedSeason, round: selectedRound });
      setAnalysis(result);
      setPreviewData(result.rows);
      setStatus({ type: result.errors.length ? 'error' : 'ready', message: result.errors.length
        ? `${result.errors.length}개 행의 오류를 수정해주세요. 전체 파일 전송이 차단됩니다.`
        : `${result.validRows.toLocaleString()}개의 데이터를 확인했습니다. 아직 서버에 저장되지 않았습니다.` });
    } catch (error) {
      if (current === generation.current) setStatus({ type: 'error', message: error.message });
    } finally { if (current === generation.current) setParsing(false); }
  };

  const handleUpload = async () => {
    if (lock.current || parsing || !hasScope || !previewData.length || analysis?.errors.length) return;
    if (!canUpload) { setStatus({ type: 'error', message: '관리자 로그인이 필요합니다.' }); return; }
    lock.current = true;
    setUploading(true);
    setUploadResult(null);
    setStatus({ type: 'uploading', message: '전체 데이터를 전송하고 있습니다. 서버에서 저장 결과를 기다려주세요.' });
    try {
      const result = await uploadDonations({ rows: previewData, season: selectedSeason, round: selectedRound,
        onState: state => {
          if (state.sentRows != null) setSentRows(state.sentRows);
          if (state.phase === 'verifying') setStatus({ type: 'uploading', message: '서버 저장 응답을 받았습니다. 등록 내역을 다시 확인하고 있습니다.' });
        } });
      setUploadResult(result);
      setRefresh(value => value + 1);
      setStatus({ type: result.complete ? 'success' : 'error', message: result.complete
        ? `${scopeLabel} 업로드 및 저장 확인 완료 (${result.verifiedRows}건)`
        : `저장 성공 ${result.insertedRows}건 / 실패 ${result.failedRows}건 / 재조회 확인 ${result.verifiedRows ?? '미확인'}건. 재전송 전에 등록 내역을 확인해주세요.` });
    } catch (error) {
      setStatus({ type: 'error', message: `${error.message} 자동 재시도하지 않습니다.` });
    } finally { lock.current = false; setUploading(false); }
  };

  const parseSummary = analysis && <div className="filter-panel parse-summary" role="status">
    <p>엑셀 전체 {analysis.totalRows.toLocaleString()}행 · 빈 행 제외 {analysis.excluded.length}행 · 데이터 {analysis.dataRows.toLocaleString()}건</p>
    <p>파싱 {analysis.parsedRows.toLocaleString()}건 · 유효 {analysis.validRows.toLocaleString()}건 · 오류 {analysis.errors.length}건 · 전송 {sentRows}건</p>
    {analysis.excluded.length > 0 && <details><summary>제외된 빈 행 확인</summary><p>{analysis.excluded.map(item => `${item.row}행: ${item.reason}`).join(', ')}</p></details>}
    {analysis.errors.length > 0 && <details open><summary>오류 행 확인</summary><ul>{analysis.errors.slice(0, 100).map(item => <li key={item.row}>{item.row}행: {item.message}</li>)}</ul>{analysis.errors.length > 100 && <p>처음 100개 오류를 표시합니다.</p>}</details>}
  </div>;

  return (
    <div className="admin-page">

      <section className="mobile admin-mobile">

        {/* ================================================
            HEADER
        ================================================ */}

        <header className="header admin-header">

          <Link
            className="header-icon"
            to="/"
            aria-label="사용자 페이지"
          >
            <ArrowLeft
              size={18}
            />
          </Link>

          <div>

            <p className="eyebrow">
              HM LABEL ADMIN
            </p>

            <h1>
              운영자 페이지
            </h1>

          </div>

        </header>

        <section className="filter-panel admin-auth" aria-label="관리자 인증">
          <h2>관리자 {session ? '인증 완료' : '로그인'}</h2>
          {session ? <div className="admin-session"><p>인증 만료: {new Date(session.expiresAt).toLocaleTimeString('ko-KR')}</p>
            <button type="button" className="secondary-button" disabled={uploading} onClick={logoutAdmin}>로그아웃</button></div>
            : <form onSubmit={handleLogin}><label htmlFor="admin-password">관리자 비밀번호</label>
              <input id="admin-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required maxLength={1024} disabled={loggingIn} />
              <button className="primary-button" disabled={loggingIn || !password}>{loggingIn ? '인증 중...' : '로그인'}</button>
              <p className="helper-text">인증은 30분 동안 유지됩니다. 새로고침 후에는 다시 로그인해주세요.</p></form>}
          {authError && <p className="notice error" role="alert">{authError}</p>}
          {PREVIEW_MODE && <p className="helper-text">개발 프리뷰에서는 서버 업로드를 하지 않습니다.</p>}
        </section>
        {/* ================================================
            01. 팀 / 시즌 / 회차 선택
        ================================================ */}

        <section className="filter-panel">

          <div className="filter-title">

            <span>
              01
            </span>

            <div>

              <h2>
                업로드 범위 선택
              </h2>

              <p>
                시즌, 회차를 순서대로 선택합니다.
              </p>

            </div>

          </div>

          <p className="label admin-scope-label">시즌</p>
          <label className="select-box">
            <select aria-label="시즌" value={selectedSeason} disabled={uploading}
              onChange={e => {
                setSelectedSeason(e.target.value);
                setSelectedRound('');
                resetUpload();
              }}>
              <option value="">시즌 선택</option>
              {SEASONS.map(season => <option key={season} value={season}>{season}</option>)}
            </select>
            <ChevronDown size={17} />
          </label>

          <p className="label admin-scope-label">
            회차
          </p>

          <label className="select-box">

            <select
              aria-label="회차"
              disabled={!selectedSeason || uploading}
              value={
                selectedRound
              }
              onChange={(e) => {

                setSelectedRound(
                  e.target.value
                );

                resetUpload();

              }}
            >

              <option value="">
                회차 선택
              </option>

              {ROUNDS.map(
                (round) => (

                  <option
                    key={
                      round
                    }
                    value={
                      round
                    }
                  >
                    {round}
                  </option>

                )
              )}

            </select>

            <ChevronDown
              size={17}
            />

          </label>

        </section>

        {hasScope && <div className="notice existing-data" role="status">
          {existing === null ? '기존 등록 내역을 확인하는 중입니다.' : existing.error || `기존 등록 데이터: ${existing.count.toLocaleString()}건`}
          <button type="button" className="secondary-button" disabled={uploading} onClick={() => setRefresh(value => value + 1)}>등록 내역 새로고침</button>
          <Link className="secondary-button" to={`/season/${selectedSeason.replace('시즌', '')}`}>시즌 데이터 조회</Link>
        </div>}
        {parseSummary}

        {/* ================================================
            02. 엑셀 업로드
        ================================================ */}

        <section className="section">

          <div className="section-title">

            <div>

              <span>
                02
              </span>

              <div>

                <h2>
                  엑셀 업로드
                </h2>

                <p>
                  선택한 시즌 / 회차에 Excel 데이터를 업로드합니다.
                </p>

              </div>

            </div>

          </div>

          <div
            className={
              `admin-upload-box ${
                !hasScope || uploading || parsing
                  ? 'disabled'
                  : ''
              }`
            }
          >

            <FileSpreadsheet
              size={36}
            />

            <strong>

              {
                selectedFileName ||
                '엑셀 파일 선택'
              }

            </strong>

            <p>
              .xlsx 또는 .xls 파일
            </p>

            <label
              className={
                `admin-file-button ${
                  !hasScope || uploading || parsing
                    ? 'disabled'
                    : ''
                }`
              }
              htmlFor="excel-upload"
            >
              파일 선택
            </label>

            <input
              className="hidden-input"
              id="excel-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={
                handleFileChange
              }
              disabled={
                !hasScope ||
                uploading || parsing
              }
            />

          </div>

          {!hasScope && (

            <p className="helper-text centered">

              시즌, 회차를 먼저 선택해주세요.

            </p>

          )}

        </section>

        {/* ================================================
            STATUS
        ================================================ */}

        {status.message && (

          <div
            role="status"
            className={
              `admin-status ${status.type}`
            }
          >

            {
              status.type ===
              'success'
                ? (

                  <CheckCircle2
                    size={18}
                  />

                )
                : status.type ===
                  'error'
                  ? (

                    <AlertCircle
                      size={18}
                    />

                  )
                  : (

                    <FileSpreadsheet
                      size={18}
                    />

                  )
            }

            <span>
              {status.message}
            </span>

          </div>

        )}

        {/* ================================================
            실제 서버 저장 결과
        ================================================ */}

        {uploadResult && (

          <section className="section">

            <div className="section-title">

              <div>

                <span>
                  결과
                </span>

                <div>

                  <h2>
                    Supabase 저장 결과
                  </h2>

                  <p>
                    서버에서 확인한 실제 저장 결과입니다.
                  </p>

                </div>

              </div>

            </div>

            <p>최종 저장 재조회 확인: {uploadResult.verifiedRows ?? '미확인'}건</p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(3, 1fr)',
                gap: '10px'
              }}
            >

              <div
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background:
                    'rgba(255,255,255,0.05)',
                  textAlign: 'center'
                }}
              >

                <div
                  style={{
                    fontSize: '12px',
                    opacity: 0.7,
                    marginBottom: '5px'
                  }}
                >
                  요청
                </div>

                <strong
                  style={{
                    fontSize: '20px'
                  }}
                >
                  {
                    uploadResult
                      .requestedRows
                  }
                </strong>

              </div>

              <div
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background:
                    'rgba(255,255,255,0.05)',
                  textAlign: 'center'
                }}
              >

                <div
                  style={{
                    fontSize: '12px',
                    opacity: 0.7,
                    marginBottom: '5px'
                  }}
                >
                  성공
                </div>

                <strong
                  style={{
                    fontSize: '20px'
                  }}
                >
                  {
                    uploadResult
                      .insertedRows
                  }
                </strong>

              </div>

              <div
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background:
                    'rgba(255,255,255,0.05)',
                  textAlign: 'center'
                }}
              >

                <div
                  style={{
                    fontSize: '12px',
                    opacity: 0.7,
                    marginBottom: '5px'
                  }}
                >
                  실패
                </div>

                <strong
                  style={{
                    fontSize: '20px'
                  }}
                >
                  {
                    uploadResult
                      .failedRows
                  }
                </strong>

              </div>

            </div>

            {uploadResult.failedBatches.length > 0 && (

              <div
                style={{
                  marginTop: '14px'
                }}
              >

                <strong>
                  실패 배치
                </strong>

                {uploadResult.failedBatches.map(
                  (
                    batch,
                    index
                  ) => (

                    <div
                      key={
                        `${batch.batchNumber}-${index}`
                      }
                      style={{
                        marginTop: '8px',
                        padding: '12px',
                        borderRadius: '10px',
                        background:
                          'rgba(255,255,255,0.05)',
                        fontSize: '13px',
                        lineHeight: 1.6
                      }}
                    >

                      <div>
                        배치:
                        {' '}
                        {
                          batch.batchNumber ??
                          '-'
                        }
                      </div>

                      <div>
                        실패:
                        {' '}
                        {
                          batch.count ??
                          '-'
                        }
                        건
                      </div>

                      {batch.message && (

                        <div>
                          오류:
                          {' '}
                          {
                            batch.message
                          }
                        </div>

                      )}

                    </div>

                  )
                )}

              </div>

            )}

          </section>

        )}

        {/* ================================================
            03. 업로드 미리보기
        ================================================ */}

        {previewData.length > 0 && (

          <section className="section">

            <div className="section-title">

              <div>

                <span>
                  03
                </span>

                <div>

                  <h2>
                    업로드 미리보기
                  </h2>

                  <p>
                    {scopeLabel} · 총 {previewData.length}건
                  </p>

                </div>

              </div>

            </div>

            <div className="table-wrap">

              <table className="excel-table admin-preview-table">

                <thead>

                  <tr>

                    <th>
                      No.
                    </th>

                    <th>
                      아이디
                    </th>

                    <th>
                      닉네임
                    </th>

                    <th>
                      채팅
                    </th>

                    <th>
                      스트리머
                    </th>

                    <th>
                      종류
                    </th>

                    <th className="number-cell">
                      개수
                    </th>

                    <th>
                      시간
                    </th>

                    <th>
                      회차
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {previewData.slice(previewPage * 100, (previewPage + 1) * 100).map(
                    (item) => (

                      <tr
                        key={
                          item._row
                        }
                      >

                        <td className="rank-cell">
                          {
                            item._row
                          }
                        </td>

                        <td>
                          {
                            item.아이디 ||
                            '-'
                          }
                        </td>

                        <td>
                          {
                            item.닉네임 ||
                            '-'
                          }
                        </td>

                        <td className="chat-cell">
                          {
                            item.채팅 ||
                            '-'
                          }
                        </td>

                        <td>
                          {
                            item.스트리머 ||
                            '-'
                          }
                        </td>

                        <td>
                          {
                            item.종류 ||
                            '-'
                          }
                        </td>

                        <td className="number-cell score-cell">

                          {
                            Number(
                              item.개수 ||
                              0
                            ).toLocaleString()
                          }

                        </td>

                        <td className="time-cell">
                          {
                            item.시간 ||
                            '-'
                          }
                        </td>

                        <td>
                          {
                            item.회차
                          }
                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

            {previewData.length > 100 && <div className="table-pagination" aria-label="엑셀 미리보기 페이지">
              <button className="secondary-button" disabled={previewPage === 0} onClick={() => setPreviewPage(n => n - 1)}>이전</button>
              <span>{previewPage + 1} / {Math.ceil(previewData.length / 100)} 페이지 · 전체 {previewData.length.toLocaleString()}건</span>
              <button className="secondary-button" disabled={(previewPage + 1) * 100 >= previewData.length} onClick={() => setPreviewPage(n => n + 1)}>다음</button>
            </div>}
            <div className="admin-actions">

              <button
                type="button"
                className="secondary-button"
                onClick={
                  resetUpload
                }
                disabled={
                  uploading
                }
              >
                다시 선택
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={handleUpload}
                disabled={uploading || parsing || !canUpload || !!analysis?.errors.length}
              >

                <Upload
                  size={18}
                />

                {
                  uploading
                    ? '업로드 중...'
                    : canUpload ? `${previewData.length}건 업로드` : '관리자 로그인 필요'
                }

              </button>

            </div>

          </section>

        )}



      </section>

    </div>
  );
}
