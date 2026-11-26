"""Chrome browser QA. All API traffic is intercepted; no real database writes."""
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests/artifacts'
CHROME = os.environ.get('HM_LABEL_CHROME', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
checks, requests, writes, errors, mock_posts = [], [], [], [], []


def passed(name):
    checks.append(name)
    print('PASS ' + name, flush=True)


@contextmanager
def server(production=False):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    env = dict(os.environ, VITE_PREVIEW_MODE='false', VITE_API_BASE_URL='https://hm-label.test.invalid')
    args = [shutil.which('node'), str(ROOT / 'node_modules/vite/bin/vite.js')]
    if production:
        args.append('preview')
    args += ['--host', '127.0.0.1', '--port', str(port), '--strictPort']
    with (ARTIFACTS / ('production.log' if production else 'integration.log')).open('w', encoding='utf-8') as log:
        process = subprocess.Popen(args, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        try:
            url = f'http://127.0.0.1:{port}'
            for _ in range(100):
                if process.poll() is not None:
                    raise RuntimeError('QA server exited')
                try:
                    if urllib.request.urlopen(url, timeout=1).status == 200:
                        break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('QA server timeout')
            yield url
        finally:
            process.terminate()
            process.wait(timeout=10)


def fixture(season, count=None):
    if count is not None:
        return [dict(id=i+1, team='C팀', season=season, round='HM레이블 1회차', streamer='멤버 A',
                     nickname=f'후원자 {i}', user_id=f'user-{i}', amount=-100 if i % 5 == 0 else 200,
                     chat='', type='후원', time='2026-11-26 21:00:00') for i in range(count)]
    return [dict(id=f'{season}-{r}-{m}-{i}', team='C팀', season=season, round=r, streamer=f'멤버 {m}',
                 nickname=f'후원자 {i % 7}', user_id=f'user-{i % 7}', amount=-200 if i == 5 else (i % 5 + 1) * 100,
                 chat='응원♡', type='후원', time=f'2026-11-26 {18+i//4:02}:{i*3%60:02}:00')
            for r in ['HM레이블 직급전', 'HM레이블 1회차'] for m in ['A', 'B'] for i in range(18)]


def check_preservation():
    original = ROOT.parent / 'HM-NewData-master'
    if not original.exists():
        print('SKIP source comparison (standalone checkout)', flush=True)
        return
    before = (original / 'src/pages/ViewerPage.jsx').read_text(encoding='utf-8')
    after = (ROOT / 'src/pages/ViewerPage.jsx').read_text(encoding='utf-8')
    start = '  const selectedRows ='
    old = before[before.index(start):before.index('  const scopeSelection =')].replace('스트리머', '멤버').strip()
    new = after[after.index(start):after.index('  return (\n    <main className="page">')].strip()
    assert old == new, 'Aggregation formula changed'
    assert (original / 'public/logo.jpg').read_bytes() == (ROOT / 'public/logo.jpg').read_bytes()
    passed('Original aggregation block and logo preserved')


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    check_preservation()
    state = {'mode': 'ready', 'count': None, 'delay': False, 'pending': [], 'saved': [], 'uploadMode': 'success'}

    def guard(route):
        request = route.request
        parsed = urlparse(request.url)
        if parsed.hostname in ('localhost', '127.0.0.1'):
            return route.continue_()
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'}
        if request.method == 'OPTIONS':
            return route.fulfill(status=204, headers=cors)
        if parsed.path == '/upload-supabase-rable' and request.method == 'POST':
            assert 'authorization' not in request.headers
            assert 'cookie' not in request.headers
            assert not page.context.cookies()
            assert page.evaluate('sessionStorage.length') == 0
            body = request.post_data_json
            assert set(body) == {'season', 'round', 'data'}
            assert body['round'].startswith('HM레이블 ')
            mock_posts.append({'season': body['season'], 'round': body['round'], 'count': len(body['data'])})
            inserted = [dict(id=100000 + len(state['saved']) + i, team='C팀', season=body['season'], round=body['round'],
                             user_id=r['아이디'], nickname=r['닉네임'], chat=r['채팅'], streamer=r['스트리머'],
                             type=r['종류'], amount=r['개수'], time=r['시간']) for i, r in enumerate(body['data'])]
            partial = state['uploadMode'] == 'partial'
            if partial:
                inserted = inserted[100:]
            state['saved'].extend(inserted)
            result = {'success': not partial, 'requestedRows': len(body['data']), 'insertedRows': len(inserted),
                      'failedRows': len(body['data']) - len(inserted), 'data': inserted}
            if partial:
                result['failedBatches'] = [{'batchNumber': 1, 'startIndex': 0, 'endIndex': 99, 'count': 100}]
            return route.fulfill(status=207 if partial else 200, json=result, headers=cors)
        if request.method not in ('GET', 'HEAD'):
            writes.append(request.url)
            return route.abort()
        assert parsed.path in ('/supabase-data-rable', '/top200-rable'), 'Unexpected endpoint ' + request.url
        params = {key: value[0] for key, value in parse_qs(parsed.query).items()}
        assert set(params) <= {'season', 'round'}
        requests.append(params)
        if state['delay'] and params.get('season') == '시즌1':
            state['pending'].append(route)
            return
        if state['mode'] == 'error':
            return route.fulfill(status=503, json={'success': False, 'error': '테스트 서버 연결 오류'}, headers={'Access-Control-Allow-Origin': '*'})
        rows = [] if state['mode'] == 'empty' else fixture(params['season'], state['count']) + [row for row in state['saved'] if row['season'] == params['season']]
        if parsed.path == '/top200-rable':
            donors = {}
            for row in rows:
                donor = donors.setdefault(row['nickname'], dict(team='C팀', season=params['season'], nickname=row['nickname'], total_amount=0, donation_count=0))
                donor['total_amount'] += row['amount']
                donor['donation_count'] += 1
            ranked = sorted(donors.values(), key=lambda row: (-row['total_amount'], row['nickname']))[:200]
            return route.fulfill(json={'success': True, 'count': len(ranked), 'data': [dict(row, rank=i+1) for i, row in enumerate(ranked)]}, headers=cors)
        if 'round' in params:
            rows = [row for row in rows if row['round'] == params['round']]
        if state['mode'] == 'mixed':
            rows[0]['season'] = '시즌3'
        body = {'success': True, 'count': len(rows) + (1 if state['mode'] == 'truncated' else 0), 'data': rows}
        route.fulfill(json=body, headers={'Access-Control-Allow-Origin': '*'})

    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME, headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Seoul')
        context.route('**/*', guard)
        page = context.new_page()
        page.set_default_timeout(15000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        with server() as base:
            page.goto(base)
            expect(page).to_have_title('HM레이블 | HM LABEL')
            expect(page.get_by_role('navigation', name='시즌 선택').get_by_role('button')).to_have_count(3)
            expect(page.locator('.preview-banner')).to_have_count(0)
            for season in (1, 2, 3):
                page.goto(base + f'/season/{season}')
                page.get_by_label('회차', exact=True).select_option('HM레이블 1회차')
                page.get_by_label('멤버', exact=True).select_option('멤버 A')
                expect(page.locator('.selected-banner')).to_contain_text('4,800점')
                expect(page.locator('.selected-banner')).to_contain_text('5,200점')
                expect(page.locator('.detail-table tbody tr')).to_have_count(18)
                expect(page.locator('.donor-table tbody tr')).to_have_count(7)
                expect(page.locator('.hourly-table tbody tr')).to_have_count(5)
                expect(page.locator('.recharts-surface').first).to_be_visible()
            passed('Live adapter: all seasons, server round filter, member filter, totals, negative contribution, charts')

            search = page.get_by_label('후원자 검색', exact=True)
            search.fill('user-3')
            expect(page.locator('.donor-table tbody tr')).to_have_count(1)
            search.fill('없는 후원자')
            expect(page.locator('.donor-table .empty-table')).to_be_visible()
            search.fill('')
            page.get_by_role('button', name='시즌 후원자 TOP 200 보기', exact=True).click()
            expect(page.locator('.top200-table tbody tr')).to_have_count(7)
            expect(page.locator('.top200-table tbody tr').first).to_contain_text('후원자 2')
            passed('Search and C-team season TOP 200 with actual signed totals and matching season scope')

            for width in (360, 375, 390, 393, 414, 430, 768, 1440, 1920):
                page.set_viewport_size({'width': width, 'height': 1000})
                # ResponsiveContainer observes size changes asynchronously.
                page.wait_for_function('document.documentElement.scrollWidth <= innerWidth + 1', timeout=5000)
                page.screenshot(path=str(ARTIFACTS / f'viewer-{width}.png'), full_page=True)
                if page.locator('.top200-open').count():
                    page.locator('.top200-open').click()
                expect(page.locator('.top200-table')).to_be_visible()
                page.locator('.top200-panel').screenshot(path=str(ARTIFACTS / f'top200-{width}.png'))
                page.goto(base)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                page.screenshot(path=str(ARTIFACTS / f'home-{width}.png'), full_page=True)
                page.goto(base + '/season/3')
                page.get_by_label('회차', exact=True).select_option('HM레이블 1회차')
                page.get_by_label('멤버', exact=True).select_option('멤버 A')
            passed('Home, viewer, TOP 200 and graphs at nine widths from 360 to 1920px without overflow')

            state['delay'] = True
            page.get_by_role('navigation', name='시즌 선택').get_by_role('button', name='시즌 1', exact=True).click()
            expect(page.get_by_label('회차', exact=True)).to_be_disabled()
            page.get_by_role('navigation', name='시즌 선택').get_by_role('button', name='시즌 2', exact=True).click()
            expect(page.get_by_label('회차', exact=True)).to_be_enabled()
            for pending in state['pending']:
                try:
                    pending.fulfill(json={'success': True, 'count': 0, 'data': []})
                except Exception:
                    pass  # Browser may already have canceled the stale XHR.
            state['delay'] = False
            expect(page.get_by_label('회차', exact=True)).to_have_value('')
            expect(page.get_by_label('멤버', exact=True)).to_have_value('')
            expect(page.locator('.detail-table')).to_have_count(0)
            page.screenshot(path=str(ARTIFACTS / 'season-reset.png'), full_page=True)
            passed('Season switch aborts stale response and resets round/member/rank/chart state')

            for mode, text in [('empty', '등록된 데이터가 없습니다'), ('error', '테스트 서버 연결 오류'),
                               ('truncated', '전체 건수가 일치하지'), ('mixed', '다른 데이터가 응답')]:
                state['mode'] = mode
                page.goto(base + '/season/1')
                if mode == 'empty':
                    expect(page.get_by_label('회차', exact=True)).to_be_disabled()
                    expect(page.locator('body')).to_contain_text('데이터가 없습니다')
                else:
                    expect(page.locator('[role=alert]')).to_contain_text(text)
                expect(page.locator('.selected-banner')).to_have_count(0)
                page.screenshot(path=str(ARTIFACTS / f'state-{mode}.png'), full_page=True)
            state['mode'] = 'ready'
            passed('Empty data, network failure, truncated counts and mixed scope are handled explicitly')

            state['count'] = 10005
            page.goto(base + '/season/1')
            page.get_by_label('회차', exact=True).select_option('HM레이블 1회차')
            page.get_by_label('멤버', exact=True).select_option('멤버 A')
            expect(page.locator('.detail-table tbody tr')).to_have_count(100)
            expect(page.locator('.detail-table tfoot')).to_contain_text('10005건')
            pager = page.get_by_role('navigation', name='상세 내역 페이지')
            pager.get_by_role('button', name='마지막', exact=True).click()
            expect(page.locator('.detail-table tbody tr')).to_have_count(5)
            expect(pager).to_contain_text('101 / 101')
            assert page.evaluate('document.querySelectorAll("tr").length') < 300
            passed('10,005 loaded rows: totals include every row; table paginates through final 5 records')
            state['count'] = None

            page.goto(base + '/admin')
            expect(page.get_by_label('팀', exact=True)).to_have_count(0)
            expect(page.get_by_label('회차', exact=True).locator('option')).to_have_count(14)
            assert page.get_by_label('회차', exact=True).locator('option').all_text_contents()[1:] == ['HM레이블 직급전'] + [f'HM레이블 {i}회차' for i in range(1,13)]
            page.get_by_label('시즌', exact=True).select_option('시즌1')
            page.get_by_label('회차', exact=True).select_option('HM레이블 12회차')
            expect(page.locator('.existing-data')).to_contain_text('기존 등록 데이터: 0건')
            # Generate an actual workbook with the same library used by the original app.
            file = ARTIFACTS / 'upload-501.xlsx'
            js = "const X=require('xlsx');const w=X.utils.book_new();X.utils.book_append_sheet(w,X.utils.aoa_to_sheet([['아이디','닉네임','채팅','스트리머','종류','개수','시간'],...Array.from({length:501},(_,i)=>['0001','한글♡','','멤버 A','후원',i===0?-100:0,46296.5])]),'데이터');X.writeFile(w,process.argv[1]);"
            subprocess.run([shutil.which('node'), '-e', js, str(file)], cwd=ROOT, check=True)
            page.locator('#excel-upload').set_input_files(str(file))
            expect(page.locator('.parse-summary')).to_contain_text('파싱 501건 · 유효 501건')
            expect(page.locator('.admin-preview-table tbody tr')).to_have_count(100)
            expect(page.locator('input[type=password]')).to_have_count(0)
            expect(page.locator('.admin-auth')).to_have_count(0)
            expect(page.locator('.admin-preview-table tbody tr').first).to_contain_text('-100')
            expect(page.get_by_role('button', name='501건 업로드', exact=True)).to_be_enabled()
            assert page.evaluate('localStorage.length') == 0
            assert page.evaluate('sessionStorage.length') == 0
            assert not context.cookies()
            page.get_by_role('button', name='501건 업로드', exact=True).click()
            expect(page.locator('.admin-status.success')).to_contain_text('업로드 및 저장 확인 완료 (501건)')
            expect(page.locator('.existing-data')).to_contain_text('기존 등록 데이터: 501건')
            before_posts = len(mock_posts)
            page.get_by_role('button', name='501건 업로드', exact=True).click()
            expect(page.locator('.admin-status.error')).to_contain_text('이미 전송한 파일')
            assert len(mock_posts) == before_posts
            for width in (360, 375, 390, 393, 414, 430, 768, 1440, 1920):
                page.set_viewport_size({'width': width, 'height': 1000})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                page.screenshot(path=str(ARTIFACTS / f'admin-{width}.png'), full_page=True)
            page.get_by_label('시즌', exact=True).select_option('시즌2')
            expect(page.locator('.admin-preview-table')).to_have_count(0)
            expect(page.get_by_label('회차', exact=True)).to_have_value('')
            page.get_by_label('회차', exact=True).select_option('HM레이블 12회차')
            page.locator('#excel-upload').set_input_files(str(file))
            state['uploadMode'] = 'partial'
            page.get_by_role('button', name='501건 업로드', exact=True).click()
            expect(page.locator('.admin-status.error')).to_contain_text('저장 성공 401건 / 실패 100건')
            expect(page.locator('.admin-status.success')).to_have_count(0)
            before_posts = len(mock_posts)
            page.get_by_role('button', name='501건 업로드', exact=True).click()
            expect(page.locator('.admin-status.error')).to_contain_text('이미 전송한 파일')
            assert len(mock_posts) == before_posts
            state['uploadMode'] = 'success'
            page.get_by_label('시즌', exact=True).select_option('시즌3')
            page.get_by_label('회차', exact=True).select_option('HM레이블 직급전')
            page.locator('#excel-upload').set_input_files(str(file))
            page.get_by_role('button', name='501건 업로드', exact=True).click()
            expect(page.locator('.admin-status.success')).to_contain_text('업로드 및 저장 확인 완료 (501건)')
            expect(page.locator('input[type=password]')).to_have_count(0)
            assert not writes
            passed('Admin: fresh context without credentials, 501-row Mock upload/readback, duplicate/207, rank round and nine widths')

        with server(production=True) as base:
            page.goto(base + '/season/1?previewState=ready')
            expect(page.locator('.preview-banner')).to_have_count(0)
            page.get_by_label('회차', exact=True).select_option('HM레이블 1회차')
            page.get_by_label('멤버', exact=True).select_option('멤버 A')
            page.goto(base + '/admin')
            expect(page.get_by_role('heading', name='운영자 페이지')).to_be_visible()
            expect(page.locator('input[type=password]')).to_have_count(0)
            for asset in (ROOT / 'dist/assets').glob('*.js'):
                assert '테스트 멤버 A' not in asset.read_text(encoding='utf-8')
            passed('Production preview: direct season/admin paths, mock excluded and live reads enabled')
        browser.close()
    assert not errors, errors
    assert not writes, writes
    (ARTIFACTS / 'results.json').write_text(json.dumps({'checks': checks, 'apiRequests': requests, 'mockUploadRequests': mock_posts, 'writes': writes, 'pageErrors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': len(checks), 'apiRequests': len(requests), 'writes': len(writes), 'pageErrors': errors}, ensure_ascii=False))


if __name__ == '__main__':
    main()
