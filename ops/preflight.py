
from pathlib import Path
import json,os,re,sys

ROOT=Path(__file__).resolve().parents[1]
problems=[]; warnings=[]; passed=[]

def ok(name,cond,problem=None,warning=False):
    if cond: passed.append(name)
    elif warning: warnings.append(problem or name)
    else: problems.append(problem or name)

# Files
for rel in [
    "backend/Dockerfile","backend/postgres/schema.sql","render.yaml","mobile/eas.json",
    "PRIVACY_DRAFT.md","TERMS_BETA_DRAFT.md","BETA_LAUNCH_CHECKLIST.md",
    ".github/workflows/ci.yml","ops/backup.sh"
]:
    ok("file:"+rel,(ROOT/rel).exists(),f"Missing required release file: {rel}")

# app config
app=json.loads((ROOT/"mobile/app.json").read_text())
expo=app.get("expo",{})
ok("iOS bundle id",expo.get("ios",{}).get("bundleIdentifier")=="com.repairpilot.app")
ok("Android package",expo.get("android",{}).get("package")=="com.repairpilot.app")
ok("deep-link scheme",expo.get("scheme")=="repairpilot")
ok("version",bool(expo.get("version")))

# no obvious secrets committed
secret_patterns=[
    ("OpenAI key",r"sk-[A-Za-z0-9_-]{20,}"),
    ("Supabase service JWT",r"eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}")
]
for name,pat in secret_patterns:
    found=False
    for p in ROOT.rglob("*"):
        if p.is_file() and p.suffix.lower() in {".py",".json",".md",".yaml",".yml",".example",".tsx",".txt"}:
            try:
                if re.search(pat,p.read_text(errors="ignore")): found=True; break
            except Exception: pass
    ok("secret scan "+name,not found,f"Potential committed {name} detected.")

ok("production env absent",not (ROOT/"backend/.env").exists(),"backend/.env should not be committed.")
ok("legal review",False,"Privacy and beta terms still require owner/counsel review before public release.",warning=True)

print("RepairPilot V15 Preflight")
for x in passed: print(" PASS",x)
for x in warnings: print(" WARN",x)
for x in problems: print(" FAIL",x)
print(f"\n{len(passed)} passed, {len(warnings)} warnings, {len(problems)} failures")
raise SystemExit(1 if problems else 0)
