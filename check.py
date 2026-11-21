"""One command to check GitaSaarthi.

    python check.py            unit tests, JS tests, JS syntax check
    python check.py --e2e      the same, plus the browser smoke test (needs Playwright)

Exits 0 when everything passes, 1 otherwise.
"""
import glob
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
results = []


def run(label, cmd, timeout=600):
    print(f"\n=== {label} ===", flush=True)
    try:
        r = subprocess.run(cmd, cwd=ROOT, timeout=timeout)
        ok = r.returncode == 0
    except FileNotFoundError:
        print(f"command not found: {cmd[0]}")
        ok = False
    except subprocess.TimeoutExpired:
        print("timed out")
        ok = False
    results.append((label, ok))
    return ok


def js_syntax():
    print("\n=== JS syntax (js/*.js) ===", flush=True)
    files = sorted(glob.glob(os.path.join(ROOT, "js", "*.js")))
    bad = []
    for f in files:
        code = "new Function(require('fs').readFileSync(process.argv[1],'utf8'))"
        try:
            r = subprocess.run(["node", "-e", code, f], cwd=ROOT, capture_output=True, text=True)
        except FileNotFoundError:
            print("command not found: node")
            results.append(("JS syntax", False))
            return
        if r.returncode != 0:
            bad.append(os.path.basename(f))
            print(f"  FAIL {os.path.basename(f)}: {(r.stderr or r.stdout).strip().splitlines()[-1:]}")
    print(f"  checked {len(files)} files, {len(bad)} with errors")
    results.append(("JS syntax", not bad and bool(files)))


def main():
    run("Python unit tests", [sys.executable, "-m", "unittest", "tests/test_server.py"])
    tests = sorted(glob.glob(os.path.join(ROOT, "tests", "*.test.js")))
    run("Node tests", ["node", "--test"] + [os.path.relpath(t, ROOT) for t in tests])
    js_syntax()
    if "--e2e" in sys.argv[1:]:
        run("Browser smoke test", ["node", "tests/e2e_smoke.mjs"])
    else:
        print("\n(browser smoke test skipped; pass --e2e to run it)")

    print("\n=== Summary ===")
    for label, ok in results:
        print(f"{'PASS' if ok else 'FAIL'}  {label}")
    good = all(ok for _, ok in results)
    print("\nALL CHECKS PASSED" if good else "\nSOME CHECKS FAILED")
    return 0 if good else 1


if __name__ == "__main__":
    sys.exit(main())
