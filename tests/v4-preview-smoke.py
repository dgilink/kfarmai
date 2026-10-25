"""Browser smoke against the final Pages artifact, not immutable KB source bytes."""
import os
import shutil
import subprocess
import time
from pathlib import Path
from threading import Thread
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

options = Options()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-gpu")
driver = webdriver.Chrome(options=options)
root = Path(__file__).resolve().parents[1]
artifact_temp = None
server = None

def artifact_origin():
    """Build the exact Pages presentation layer used for KB article delivery."""
    global artifact_temp, server
    explicit = os.environ.get("V4_PREVIEW_ORIGIN", "").rstrip("/")
    if explicit:
        return explicit
    artifact_temp = root / f"kfarmai-pages-artifact-smoke-{os.getpid()}"
    artifact_dir = artifact_temp
    subprocess.run(
        ["node", "scripts/pages/build-pages-artifact.cjs", f"--output={artifact_dir}"],
        cwd=root, check=True, capture_output=True, text=True,
    )
    handler = lambda *args, **kwargs: SimpleHTTPRequestHandler(*args, directory=str(artifact_dir), **kwargs)
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_port}"

origin = artifact_origin()
pages = [
    "/index.html", "/channel.html", "/post.html", "/agri-info.html", "/kb/index.html",
    "/kb/strawberry-small-smartfarm.html",
    "/kb/strawberry-winter-light-humidity-check.html",
    "/kb/greenhouse-heating-preflight-notes.html",
]
failures = []
try:
    for page in pages:
        driver.get(origin + page)
        WebDriverWait(driver, 10).until(lambda d: d.execute_script("return document.readyState") == "complete")
        WebDriverWait(driver, 10).until(lambda d: d.execute_script("return !!document.querySelector('.v4-nav')"))
        if page == "/agri-info.html":
            # The approved KB presentation list must render before live public-data sections.
            WebDriverWait(driver, 10).until(
                lambda d: len(d.find_elements(By.CSS_SELECTOR, "#agriKbList .agri-kb-row")) > 0
            )
            kb_result = driver.execute_script("""
                const section = document.querySelector('#agriKbListSection');
                const rows = [...document.querySelectorAll('#agriKbList .agri-kb-row')];
                const next = section?.nextElementSibling;
                return {
                  rows: rows.length,
                  textOnlyRows: rows.filter(row => !row.querySelector('img')).length,
                  beforeLiveData: !!next && next.classList.contains('agri-smartfarm-entry'),
                  brokenImages: rows.filter(row => {
                    const image = row.querySelector('img');
                    return image && image.complete && image.naturalWidth === 0;
                  }).length,
                };
            """)
            if (kb_result["rows"] < 1 or kb_result["textOnlyRows"] < 1
                    or not kb_result["beforeLiveData"] or kb_result["brokenImages"]):
                failures.append((page, "kb presentation list", kb_result))
        for width in [320, 360, 390, 430, 768, 1024, 1440]:
            driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
                "width": width, "height": 900, "deviceScaleFactor": 1,
                "mobile": width < 768,
            })
            result = driver.execute_script("""
                return {
                    width: innerWidth,
                    scrollWidth: document.documentElement.scrollWidth,
                    navCount: document.querySelectorAll('.v4-nav a, .v4-nav button').length,
                    menuRight: (() => {
                      const n = document.querySelector('.v4-nav');
                      if (!n) return false;
                      const b = n.querySelector('button');
                      return b === n.lastElementChild;
                    })(),
                    navVisible: [...document.querySelectorAll('.v4-nav > a, .v4-nav > button')].every(el => {
                      const r = el.getBoundingClientRect();
                      const s = getComputedStyle(el);
                      return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth + 1
                        && s.display !== 'none' && s.visibility === 'visible' && Number(s.opacity) > 0;
                    })
                };
            """)
            if result["scrollWidth"] > result["width"] + 1:
                failures.append((page, width, "horizontal overflow", result))
            if result["navCount"] != 4 or not result["menuRight"] or not result["navVisible"]:
                failures.append((page, width, "four-tab navigation", result))
            if page in ["/kb/strawberry-winter-light-humidity-check.html", "/kb/greenhouse-heating-preflight-notes.html"]:
                image_result = driver.execute_script("""
                    const article = document.querySelector('.knowledge-article');
                    const infographic = article?.querySelector('img[src*="-infographic."]');
                    const photo = [...(article?.querySelectorAll('img') || [])].find(image => !image.src.includes('-infographic.'));
                    const infoRect = infographic?.getBoundingClientRect();
                    const articleRect = article?.getBoundingClientRect();
                    return {
                      present: !!infographic,
                      objectFit: infographic ? getComputedStyle(infographic).objectFit : '',
                      complete: !!infographic?.complete,
                      naturalWidth: infographic?.naturalWidth || 0,
                      clipped: !!infoRect && (infoRect.left < -1 || infoRect.right > innerWidth + 1 || infoRect.width > articleRect.width + 1),
                      centered: !!infoRect && Math.abs(
                        (infoRect.left + infoRect.right) / 2 - (articleRect.left + articleRect.right) / 2
                      ) <= 1,
                      photoObjectFit: photo ? getComputedStyle(photo).objectFit : '',
                    };
                """)
                if (not image_result["present"] or image_result["objectFit"] != "contain"
                        or not image_result["complete"] or not image_result["naturalWidth"]
                        or image_result["clipped"] or not image_result["centered"]
                        or image_result["photoObjectFit"] == "contain"):
                    failures.append((page, width, "infographic presentation", image_result))
            print(page, width, result)
            screenshot_dir = os.environ.get("V4_SCREENSHOT_DIR")
            if screenshot_dir:
                target = Path(screenshot_dir)
                target.mkdir(parents=True, exist_ok=True)
                driver.save_screenshot(str(target / (page.strip("/").replace("/", "-") + f"-{width}.png")))
        driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
    for page, opener, panel, required in [
        ("/index.html", "openMyPanel()", "#myPanel .my-panel", "#authEmail"),
        ("/index.html", "openModal()", "#writeModal .modal", "#postImages"),
        ("/channel.html", "openWriteFlow()", "#writeModal .modal", "#postImages"),
    ]:
        driver.get(origin + page)
        WebDriverWait(driver, 10).until(lambda d: d.execute_script("return document.readyState") == "complete")
        for width in [320, 390, 1440]:
            driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
                "width": width, "height": 900, "deviceScaleFactor": 1,
                "mobile": width < 768,
            })
            driver.execute_script(opener)
            time.sleep(0.35)
            result = driver.execute_script("""
                const panel = document.querySelector(arguments[0]);
                const field = document.querySelector(arguments[1]);
                const rect = panel?.getBoundingClientRect();
                const overlay = panel?.parentElement;
                const nav = document.querySelector('.v4-nav');
                return {open: !!panel && getComputedStyle(panel).visibility !== 'hidden' && rect.width > 0,
                    field: !!field, overflow: document.documentElement.scrollWidth > innerWidth + 1,
                    panelOverflow: !!rect && (rect.left < -1 || rect.right > innerWidth + 1),
                    aboveNav: !!overlay && !!nav && Number(getComputedStyle(overlay).zIndex) > Number(getComputedStyle(nav).zIndex),
                    radius: panel ? parseFloat(getComputedStyle(panel).borderTopLeftRadius) : -1};
            """, panel, required)
            if not result["open"] or not result["field"] or result["overflow"] or result["panelOverflow"] or not result["aboveNav"] or result["radius"] != 0:
                failures.append((page, width, opener, result))
            screenshot_dir = os.environ.get("V4_SCREENSHOT_DIR")
            if screenshot_dir:
                target = Path(screenshot_dir)
                target.mkdir(parents=True, exist_ok=True)
                driver.save_screenshot(str(target / (page.strip("/").replace("/", "-") + "-" + opener.split("(")[0] + f"-{width}.png")))
            driver.execute_script("document.querySelector('#myPanel')?.classList.remove('open'); document.querySelector('#writeModal')?.classList.remove('open')")
        driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
    # The all menu is a fourth primary screen, so capture and assert it separately.
    driver.get(origin + "/index.html")
    WebDriverWait(driver, 10).until(lambda d: d.execute_script("return !!document.querySelector('.v4-nav')"))
    for width in [390, 1440]:
        driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
            "width": width, "height": 900, "deviceScaleFactor": 1,
            "mobile": width < 768,
        })
        driver.find_element("css selector", ".v4-nav button[aria-controls='v4AllMenu']").click()
        WebDriverWait(driver, 5).until(lambda d: not d.find_element("id", "v4AllMenu").get_attribute("hidden"))
        result = driver.execute_script("""
            const menu = document.querySelector('#v4AllMenu');
            const labels = [...menu.querySelectorAll('h3')].map(item => item.textContent.trim());
            const rect = menu.getBoundingClientRect();
            return {visible: !!menu && !menu.hidden && rect.width >= innerWidth - 1,
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              groups: labels};
        """)
        required_groups = ['계정 · 내 활동', '질문 · 커뮤니티', '농업정보', 'AI 참고 · 실용 도구', '설정 · 도움말']
        if not result["visible"] or result["overflow"] or result["groups"] != required_groups:
            failures.append(("/index.html", width, "all menu", result))
        screenshot_dir = os.environ.get("V4_SCREENSHOT_DIR")
        if screenshot_dir:
            target = Path(screenshot_dir)
            target.mkdir(parents=True, exist_ok=True)
            driver.save_screenshot(str(target / f"all-menu-{width}.png"))
        driver.execute_script("document.querySelector('.v4-nav button[aria-expanded=true]')?.click()")
    driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
finally:
    driver.quit()
    if server:
        server.shutdown()
        server.server_close()
    if artifact_temp:
        shutil.rmtree(artifact_temp, ignore_errors=True)
if failures:
    raise AssertionError(failures)
