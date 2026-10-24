"""Optional Selenium smoke for a local Phase 7 preview server."""
import os
import time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

options = Options()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-gpu")
driver = webdriver.Chrome(options=options)
origin = os.environ.get("V4_PREVIEW_ORIGIN", "http://127.0.0.1:8765").rstrip("/")
pages = [
    "/index.html", "/channel.html", "/post.html", "/kb/index.html",
    "/kb/strawberry-small-smartfarm.html",
    "/kb/strawberry-winter-light-humidity-check.html",
    "/kb/greenhouse-heating-preflight-notes.html",
]
# Release mode is strict by default; preview-only runs may explicitly exclude
# immutable approved article HTML while that separate gate remains unresolved.
require_article_nav = os.environ.get("V4_PREVIEW_ONLY") != "1"
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
            if require_article_nav or not page.startswith("/kb/") or page.endswith("/index.html"):
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
if failures:
    raise AssertionError(failures)
