"""Optional 390px synthetic navigation probe; not a field Core Web Vitals test."""
import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

origin = os.environ.get("V4_PERF_ORIGIN", "http://127.0.0.1:8765").rstrip("/")
options = Options()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
driver = webdriver.Chrome(options=options)
try:
    driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
        "width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True,
    })
    driver.execute_cdp_cmd("Emulation.setCPUThrottlingRate", {"rate": 4})
    driver.execute_cdp_cmd("Network.enable", {})
    driver.execute_cdp_cmd("Network.emulateNetworkConditions", {
        "offline": False, "latency": 150,
        "downloadThroughput": 1_600_000 / 8,
        "uploadThroughput": 750_000 / 8,
    })
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": r"""
      window.__v4Vitals = {lcp: 0, cls: 0};
      try { new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__v4Vitals.lcp = entry.startTime;
          window.__v4Vitals.lcpElement = entry.element?.tagName + (entry.element?.className ? '.' + String(entry.element.className).trim().replace(/\s+/g, '.') : '');
        }
      }).observe({type: 'largest-contentful-paint', buffered: true}); } catch (_) {}
      try { new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__v4Vitals.cls += entry.value;
      }).observe({type: 'layout-shift', buffered: true}); } catch (_) {}
    """})
    repeats = max(1, min(5, int(os.environ.get("V4_PERF_COLD_REPEATS", "1"))))
    for sample in range(repeats + 1):
        cold = sample < repeats
        driver.execute_cdp_cmd("Network.setCacheDisabled", {"cacheDisabled": cold})
        driver.get(origin + "/index.html")
        time.sleep(3)
        metrics = driver.execute_script("""
          const n = performance.getEntriesByType('navigation')[0];
          const resources = performance.getEntriesByType('resource');
          return {lcp: window.__v4Vitals?.lcp || 0, lcpElement: window.__v4Vitals?.lcpElement || '', cls: window.__v4Vitals?.cls || 0,
            ttfb: n?.responseStart || 0, htmlEnd: n?.responseEnd || 0,
            dcl: n?.domContentLoadedEventEnd || 0,
            transfer: (n?.transferSize || 0) + resources.reduce((v,x) => v + (x.transferSize || 0), 0),
            slowResources: resources.filter(x => x.responseEnd > 1500).sort((a,b) => b.responseEnd - a.responseEnd).slice(0, 6).map(x => ({name: x.name.split('/').slice(-2).join('/'), end: Math.round(x.responseEnd), bytes: x.transferSize}))};
        """)
        print(f"cold-{sample + 1}" if cold else "warm", metrics)
finally:
    driver.quit()
