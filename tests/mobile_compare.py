"""Read-only comparison against the supplied H/M source; API calls are all mocked."""
from contextlib import contextmanager
from pathlib import Path
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
from hm_label_integration import ROOT, ARTIFACTS, CHROME, fixture

WIDTHS = (360, 375, 390, 393, 414, 430, 768, 1440, 1920)


@contextmanager
def serve(root):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    env = dict(os.environ, VITE_PREVIEW_MODE='false', VITE_API_BASE_URL='https://comparison.invalid')
    with (ARTIFACTS / f'compare-{root.name}.log').open('w', encoding='utf-8') as log:
        process = subprocess.Popen([shutil.which('node'), str(ROOT / 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', str(port), '--strictPort'],
                                   cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        try:
            base = f'http://127.0.0.1:{port}'
            for _ in range(100):
                try:
                    urllib.request.urlopen(base, timeout=1)
                    break
                except OSError:
                    time.sleep(.1)
            yield base
        finally:
            process.terminate()
            process.wait(timeout=10)


def main():
    original = ROOT.parent / 'HM-NewData-master'
    if not original.exists():
        print('SKIP original source is unavailable')
        return
    # The reference is read-only and has no installed React dependencies. Run an exact source copy.
    copy = Path(tempfile.mkdtemp(prefix='hm-label-mobile-')) / 'original'
    shutil.copytree(original, copy, ignore=shutil.ignore_patterns('node_modules', 'dist', '.git'))
    junction = copy / 'node_modules'
    quote = lambda value: "'" + str(value).replace("'", "''") + "'"
    subprocess.run(['powershell.exe', '-NoProfile', '-Command',
                    f'New-Item -ItemType Junction -Path {quote(junction)} -Target {quote(ROOT / "node_modules")} | Out-Null'], check=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    metrics = []
    with sync_playwright() as pw, serve(copy) as old_base, serve(ROOT) as new_base:
        browser = pw.chromium.launch(executable_path=CHROME, headless=True)
        for label, base in [('original', old_base), ('label', new_base)]:
            context = browser.new_context(timezone_id='Asia/Seoul')
            def intercept(route):
                request = route.request
                url = urlparse(request.url)
                if url.hostname in ('127.0.0.1', 'localhost'):
                    return route.continue_()
                assert request.method == 'GET', 'Comparison cannot write to any server'
                params = {key: value[0] for key, value in parse_qs(url.query).items()}
                rows = fixture(params.get('season', '시즌1'))
                if label == 'original':
                    rows = [dict(row, team=params.get('team', 'H팀')) for row in rows]
                if params.get('round'):
                    rows = [row for row in rows if row['round'] == params['round']]
                if 'top200' in url.path:
                    rows = [dict(team=params.get('team', 'C팀'), season=params['season'], rank=i+1, nickname='긴한글닉네임♡'*5,
                                 total_amount=9223372036854775807, donation_count=1005) for i in range(200)]
                return route.fulfill(json={'success': True, 'count': len(rows), 'data': rows}, headers={'Access-Control-Allow-Origin': '*'})
            context.route('**/*', intercept)
            page = context.new_page()
            page.set_default_timeout(15000)
            for width in WIDTHS:
                page.set_viewport_size({'width': width, 'height': 900})
                page.goto(base)
                page.screenshot(path=str(ARTIFACTS / f'compare-{label}-home-{width}.png'), full_page=True)
                if label == 'original':
                    page.get_by_role('button', name='H팀', exact=True).click()
                    page.get_by_role('button', name='시즌1', exact=True).click()
                else:
                    page.get_by_role('navigation', name='시즌 선택').get_by_role('link').first.click()
                page.get_by_label('회차', exact=True).select_option('HM크루 1회차')
                page.get_by_label('스트리머' if label == 'original' else '멤버', exact=True).select_option('멤버 A')
                expect(page.locator('.selected-banner')).to_be_visible()
                page.screenshot(path=str(ARTIFACTS / f'compare-{label}-viewer-{width}.png'), full_page=True)
                page.get_by_role('button', name='시즌 후원자 TOP 200 보기', exact=True).click()
                expect(page.locator('.top200-table tbody tr')).to_have_count(200)
                page.locator('.top200-panel').screenshot(path=str(ARTIFACTS / f'compare-{label}-top200-{width}.png'))
                row = page.evaluate('''() => ({ viewport:innerWidth, pageWidth:document.documentElement.scrollWidth,
                  tableInsideScroll:document.querySelector('.top200-table-wrap').scrollWidth>document.querySelector('.top200-table-wrap').clientWidth,
                  selectHeight:document.querySelector('select[aria-label="회차"]').getBoundingClientRect().height,
                  selectFont:getComputedStyle(document.querySelector('select[aria-label="회차"]')).fontSize,
                  scoreFont:getComputedStyle(document.querySelector('.mini-stats strong')).fontSize,
                  top200Rows:document.querySelectorAll('.top200-table tbody tr').length })''')
                row.update(site=label, width=width)
                metrics.append(row)
                assert row['pageWidth'] <= width + 1
                if label == 'label':
                    assert row['selectHeight'] >= 44 and int(row['selectFont'].replace('px', '')) >= 16
                page.goto(base + '/admin')
                page.screenshot(path=str(ARTIFACTS / f'compare-{label}-admin-{width}.png'), full_page=True)
            context.close()
        browser.close()
    (ARTIFACTS / 'mobile-comparison.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'PASS {len(metrics)} source comparisons: nine widths, home/viewer/TOP200/admin; screenshots saved locally')


if __name__ == '__main__':
    main()
