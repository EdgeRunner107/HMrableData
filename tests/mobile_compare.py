"""Compare the actual production reference UI against localhost; all data APIs are mocked."""
from pathlib import Path
import json
import sys
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
from hm_label_integration import ROOT, ARTIFACTS, CHROME, fixture, server

WIDTHS = (360, 375, 390, 393, 414, 430, 768, 1440, 1920)
REFERENCE = 'https://hm-new-data.vercel.app'
SELECTORS = ['.mobile', '.header', '.header-icon', '.logo-hero', '.hero-logo', '.scope-panel',
             '.season-buttons button', '.select-box', '.select-box select', '.selected-banner',
             '.mini-stats article', '.mini-stats strong', '.donor-table', '.donor-table th',
             '.detail-table', '.detail-table td', '.top200-open', '.top200-panel', '.top200-table th',
             '.top200-table td', '.top200-back', '.line-chart-area', '.recharts-cartesian-axis-tick-value',
             '.filter-panel', '.admin-upload-box', '.admin-file-button']


def measure(page):
    return page.evaluate("""selectors => Object.fromEntries(selectors.map(selector => {
      const el=document.querySelector(selector); if(!el)return [selector,null];
      const s=getComputedStyle(el), r=el.getBoundingClientRect();
      return [selector,{width:r.width,height:r.height,font:s.fontSize,weight:s.fontWeight,fontFamily:s.fontFamily,
        padding:s.padding,gap:s.gap,color:s.color,background:s.backgroundColor,backgroundImage:s.backgroundImage,
        border:s.border,borderRadius:s.borderRadius,boxShadow:s.boxShadow,overflowX:s.overflowX,overflowY:s.overflowY}];
    }))""", SELECTORS)


def main():
    if hasattr(sys.stdout,'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    assert (ROOT/'src/styles.css').read_bytes() == (ROOT.parent/'HM-NewData-master/src/styles.css').read_bytes()
    metrics=[]
    with sync_playwright() as pw, server() as local:
        browser=pw.chromium.launch(executable_path=CHROME,headless=True)
        for label,base in [('live',REFERENCE),('label',local)]:
            context=browser.new_context(timezone_id='Asia/Seoul')
            def intercept(route):
                request=route.request
                url=urlparse(request.url)
                if url.hostname in ('127.0.0.1','localhost','hm-new-data.vercel.app'):
                    assert request.method in ('GET','HEAD')
                    return route.continue_()
                assert request.method=='GET','UI comparison cannot write to any service'
                params={k:v[0] for k,v in parse_qs(url.query).items()}
                assert url.path in ('/newdata/supabase-datab','/newdata/top200','/supabase-data-rable','/top200-rable'),url.path
                if label=='label': assert params.get('team','C팀')=='C팀'
                rows=fixture(params.get('season','시즌1'))
                if label=='live': rows=[dict(row,team=params.get('team','H팀'),round=row['round'].replace('HM레이블','HM크루')) for row in rows]
                if params.get('round'):rows=[row for row in rows if row['round']==params['round']]
                if 'top200' in url.path:
                    rows=[dict(team=params.get('team','C팀'),season=params['season'],rank=i+1,nickname='비교 후원자♡',
                               total_amount=15300000-i,donation_count=1005) for i in range(200)]
                route.fulfill(json={'success':True,'count':len(rows),'data':rows},headers={'Access-Control-Allow-Origin':'*'})
            context.route('**/*',intercept)
            page=context.new_page()
            page.set_default_timeout(20000)
            for width in WIDTHS:
                page.set_viewport_size({'width':width,'height':900})
                page.goto(base)
                expect(page.locator('.hero-logo')).to_be_visible()
                page.screenshot(path=str(ARTIFACTS/f'live-compare-{label}-home-{width}.png'),full_page=True)
                home=measure(page)
                if label=='live':
                    page.get_by_role('button',name='H팀',exact=True).click()
                    page.get_by_role('button',name='시즌1',exact=True).click()
                else:
                    page.get_by_role('navigation',name='시즌 선택').get_by_role('button').first.click()
                page.get_by_label('회차',exact=True).select_option('HM크루 1회차' if label=='live' else 'HM레이블 1회차')
                page.get_by_label('스트리머' if label=='live' else '멤버',exact=True).select_option('멤버 A')
                expect(page.locator('.selected-banner')).to_be_visible()
                page.wait_for_function('document.documentElement.scrollWidth<=innerWidth+1')
                page.screenshot(path=str(ARTIFACTS/f'live-compare-{label}-viewer-{width}.png'),full_page=True)
                viewer=measure(page)
                page.get_by_role('button',name='시즌 후원자 TOP 200 보기',exact=True).click()
                expect(page.locator('.top200-table tbody tr')).to_have_count(200)
                top=measure(page)
                page.locator('.top200-panel').screenshot(path=str(ARTIFACTS/f'live-compare-{label}-top200-{width}.png'))
                page.get_by_role('link',name='운영자 페이지',exact=True).click()  # Reference direct /admin refresh is 404.
                expect(page.get_by_role('heading',name='운영자 페이지',exact=True)).to_be_visible()
                page.screenshot(path=str(ARTIFACTS/f'live-compare-{label}-admin-{width}.png'),full_page=True)
                admin=measure(page)
                if label=='label':expect(page.locator('input[type=password]')).to_have_count(0)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                metrics.append(dict(site=label,width=width,home=home,viewer=viewer,top200=top,admin=admin))
            context.close()
        browser.close()
    differences=[]
    checks=0
    for width in WIDTHS:
        original=next(row for row in metrics if row['site']=='live' and row['width']==width)
        label=next(row for row in metrics if row['site']=='label' and row['width']==width)
        for screen in ('home','viewer','top200','admin'):
            for selector,previous in original[screen].items():
                current=label[screen].get(selector)
                if previous is None or current is None:continue
                for prop in ('font','weight','fontFamily','padding','gap','color','background','backgroundImage','border','borderRadius','boxShadow','overflowX','overflowY'):
                    # Home inserts the source season panel in place of the removed team step.
                    if prop=='gap' and selector=='.header':continue
                    checks+=1
                    if previous[prop]!=current[prop]:differences.append(dict(width=width,screen=screen,selector=selector,property=prop,original=previous[prop],label=current[prop]))
                if selector in ('.mobile','.header-icon','.hero-logo','.season-buttons button','.select-box','.select-box select'):
                    # Admin .mobile height changes because team selection is intentionally absent.
                    props=('width',) if selector=='.mobile' else ('width','height')
                    for prop in props:
                        checks+=1
                        if abs(previous[prop]-current[prop])>1.1:differences.append(dict(width=width,screen=screen,selector=selector,property=prop,original=previous[prop],label=current[prop]))
    (ARTIFACTS/'mobile-comparison.json').write_text(json.dumps(dict(reference=REFERENCE,measurements=metrics,checks=checks,differences=differences),ensure_ascii=False,indent=2),encoding='utf-8')
    assert not differences, json.dumps(differences[:15],ensure_ascii=False)
    print(f'PASS actual live UI comparison: {len(metrics)} cases, {checks} matched style/size checks, no differences in compared properties')


if __name__=='__main__':
    main()
