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
finally:
    driver.quit()
    if server:
        server.shutdown()
        server.server_close()
    if artifact_temp:
        shutil.rmtree(artifact_temp, ignore_errors=True)
if failures:
    raise AssertionError(failures)
