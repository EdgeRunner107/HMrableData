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
checks, requests, writes, errors = [], [], [], []


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
        return [dict(id=i+1, team='C팀', season=season, round='HM크루 1회차', streamer='멤버 A',
                     nickname=f'후원자 {i}', user_id=f'user-{i}', amount=-100 if i % 5 == 0 else 200,
                     chat='', type='후원', time='2026-11-26 21:00:00') for i in range(count)]
    return [dict(id=f'{season}-{r}-{m}-{i}', team='C팀', season=season, round=r, streamer=f'멤버 {m}',
                 nickname=f'후원자 {i % 7}', user_id=f'user-{i % 7}', amount=-200 if i == 5 else (i % 5 + 1) * 100,
                 chat='응원♡', type='후원', time=f'2026-11-26 {18+i//4:02}:{i*3%60:02}:00')
            for r in ['HM크루 직급전', 'HM크루 1회차'] for m in ['A', 'B'] for i in range(18)]


def check_preservation():
    original = ROOT.parent / 'HM-NewData-master'
    if not original.exists():
        print('SKIP source comparison (standalone checkout)', flush=True)
        return
    before = (original / 'src/pages/ViewerPage.jsx').read_text(encoding='utf-8')
    after = (ROOT / 'src/pages/ViewerPage.jsx').read_text(encoding='utf-8')
    start = '  const selectedRows ='
    old = before[before.index(start):before.index('  const scopeSelection =')].replace('스트리머', '멤버').strip()
    new = after[after.index(start):after.index('  return (\n    <div className="viewer-page">')].strip()
    assert old == new, 'Aggregation formula changed'
    assert (original / 'public/logo.jpg').read_bytes() == (ROOT / 'public/logo.jpg').read_bytes()
    passed('Original aggregation block and logo preserved')


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    check_preservation()
    state = {'mode': 'ready', 'count': None, 'delay': False, 'pending': []}

    def guard(route):
        request = route.request
        parsed = urlparse(request.url)
        if request.method not in ('GET', 'HEAD'):
            writes.append(request.url)
            return route.abort()
        if parsed.hostname in ('localhost', '127.0.0.1'):
            return route.continue_()
        assert parsed.path == '/supabase-data-rable', 'Unexpected endpoint ' + request.url
        params = {key: value[0] for key, value in parse_qs(parsed.query).items()}
        assert set(params) <= {'season', 'round'}
        requests.append(params)
        if state['delay'] and params.get('season') == '시즌1':
            state['pending'].append(route)
            return
        if state['mode'] == 'error':
            return route.fulfill(status=503, json={'success': False, 'error': '테스트 서버 연결 오류'}, headers={'Access-Control-Allow-Origin': '*'})
        rows = [] if state['mode'] == 'empty' else fixture(params['season'], state['count'])
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
            expect(page.get_by_role('navigation', name='시즌 선택').get_by_role('link')).to_have_count(3)
            expect(page.locator('.preview-banner')).to_have_count(0)
            for season in (1, 2, 3):
                page.goto(base + f'/season/{season}')
                page.get_by_label('회차', exact=True).select_option('HM크루 1회차')
                page.get_by_label('멤버', exact=True).select_option('멤버 A')
                expect(page.locator('.selected-banner')).to_contain_text('4,800점')
                expect(page.locator('.selected-banner')).to_contain_text('5,200점')
                expect(page.locator('.detail-table tbody tr')).to_have_count(18)
                expect(page.locator('.donor-table tbody tr')).to_have_count(7)
                expect(page.locator('.hourly-table tbody tr')).to_have_count(5)
                expect(page.locator('.recharts-surface').first).to_be_visible()
            passed('Live adapter: all seasons, server round filter, member filter, totals, negative contribution, charts')

            search = page.get_by_placeholder('닉네임 또는 아이디 검색')
            search.fill('user-3')
            expect(page.locator('.donor-table tbody tr')).to_have_count(1)
            search.fill('없는 후원자')
            expect(page.locator('.donor-table .empty-table')).to_be_visible()
            search.fill('')
            page.get_by_role('button', name='시즌 후원자 TOP 200 보기', exact=True).click()
            expect(page.locator('.top200-panel')).to_contain_text('전용 순위 API 연결이 필요')
            passed('Search and unsupported season TOP 200 notice, without H/M API fallback')

            for width in (360, 390, 430, 768, 1440, 1920):
                page.set_viewport_size({'width': width, 'height': 1000})
                # ResponsiveContainer observes size changes asynchronously.
                page.wait_for_function('document.documentElement.scrollWidth <= innerWidth + 1', timeout=5000)
                page.screenshot(path=str(ARTIFACTS / f'viewer-{width}.png'), full_page=True)
                page.goto(base)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                page.screenshot(path=str(ARTIFACTS / f'home-{width}.png'), full_page=True)
                page.goto(base + '/season/3')
                page.get_by_label('회차', exact=True).select_option('HM크루 1회차')
                page.get_by_label('멤버', exact=True).select_option('멤버 A')
            passed('Home, viewer and graphs at 360/390/430/768/1440/1920px without page overflow')

            state['delay'] = True
            page.get_by_role('navigation', name='시즌 선택').get_by_role('link', name='시즌 1', exact=True).click()
            expect(page.get_by_label('회차', exact=True)).to_be_disabled()
            page.get_by_role('navigation', name='시즌 선택').get_by_role('link', name='시즌 2', exact=True).click()
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
            page.get_by_label('회차', exact=True).select_option('HM크루 1회차')
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
            page.get_by_label('시즌', exact=True).select_option('시즌1')
            page.get_by_label('회차', exact=True).select_option('HM크루 12회차')
            expect(page.locator('.existing-data')).to_contain_text('기존 등록 데이터: 0건')
            # Generate an actual workbook with the same library used by the original app.
            file = ARTIFACTS / 'upload-501.xlsx'
            js = "const X=require('xlsx');const w=X.utils.book_new();X.utils.book_append_sheet(w,X.utils.aoa_to_sheet([['아이디','닉네임','채팅','스트리머','종류','개수','시간'],...Array.from({length:501},(_,i)=>['0001','한글♡','','멤버 A','후원',i===0?-100:0,46296.5])]),'데이터');X.writeFile(w,process.argv[1]);"
            subprocess.run([shutil.which('node'), '-e', js, str(file)], cwd=ROOT, check=True)
            page.locator('#excel-upload').set_input_files(str(file))
            expect(page.locator('.parse-summary')).to_contain_text('파싱 501건 · 유효 501건')
            expect(page.locator('.admin-preview-table tbody tr')).to_have_count(100)
            expect(page.get_by_role('button', name='관리자 인증 연결 대기', exact=True)).to_be_disabled()
            expect(page.locator('.admin-preview-table tbody tr').first).to_contain_text('-100')
            for width in (360, 390, 430, 768, 1440, 1920):
                page.set_viewport_size({'width': width, 'height': 1000})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                page.screenshot(path=str(ARTIFACTS / f'admin-{width}.png'), full_page=True)
            page.get_by_label('시즌', exact=True).select_option('시즌2')
            expect(page.locator('.admin-preview-table')).to_have_count(0)
            expect(page.get_by_label('회차', exact=True)).to_have_value('')
            assert not writes
            passed('Admin: 13 rounds retained, 501-row Excel parsed, paginated preview, raw negative preserved, upload blocked, season reset, six widths')

        with server(production=True) as base:
            page.goto(base + '/season/1?previewState=ready')
            expect(page.locator('.preview-banner')).to_have_count(0)
            page.get_by_label('회차', exact=True).select_option('HM크루 1회차')
            page.get_by_label('멤버', exact=True).select_option('멤버 A')
            page.goto(base + '/admin')
            expect(page.get_by_role('heading', name='운영자 페이지')).to_be_visible()
            expect(page.locator('body')).to_contain_text('관리자 인증 연결이 필요')
            for asset in (ROOT / 'dist/assets').glob('*.js'):
                assert '테스트 멤버 A' not in asset.read_text(encoding='utf-8')
            passed('Production preview: direct season/admin paths, mock excluded and live reads enabled')
        browser.close()
    assert not errors, errors
    assert not writes, writes
    (ARTIFACTS / 'results.json').write_text(json.dumps({'checks': checks, 'apiRequests': requests, 'writes': writes, 'pageErrors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': len(checks), 'apiRequests': len(requests), 'writes': len(writes), 'pageErrors': errors}, ensure_ascii=False))


if __name__ == '__main__':
    main()
