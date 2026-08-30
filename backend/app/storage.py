
from pathlib import Path
import json, uuid, hashlib, shutil
from pypdf import PdfReader

BASE=Path(__file__).resolve().parents[2]/"data"
BASE.mkdir(exist_ok=True)
UPLOADS=BASE/"uploads"; UPLOADS.mkdir(exist_ok=True)
MANUALS=BASE/"manuals"; MANUALS.mkdir(exist_ok=True)
EQUIPMENT=BASE/"equipment.json"; REPAIRS=BASE/"repairs.json"

def _read(p):
    if not p.exists(): return []
    try:return json.loads(p.read_text(encoding="utf-8"))
    except:return []

def _write(p,d): p.write_text(json.dumps(d,indent=2),encoding="utf-8")

def equipment_all(): return _read(EQUIPMENT)
def repairs_all(): return _read(REPAIRS)

def equipment_add(d):
    items=_read(EQUIPMENT); d["id"]=d.get("id") or str(uuid.uuid4()); items.insert(0,d); _write(EQUIPMENT,items); return d

def equipment_update(eid,d):
    items=_read(EQUIPMENT)
    for i,x in enumerate(items):
        if x.get("id")==eid:
            items[i]={**x,**d,"id":eid}; _write(EQUIPMENT,items); return items[i]
    return None

def repair_add(d):
    items=_read(REPAIRS); d["id"]=d.get("id") or str(uuid.uuid4()); items.insert(0,d); _write(REPAIRS,items); return d

def save_upload(src:Path, original_name:str):
    uid=str(uuid.uuid4())
    ext=Path(original_name).suffix.lower()[:10]
    dest=UPLOADS/f"{uid}{ext}"
    shutil.copy2(src,dest)
    return uid,dest

def ingest_manual(file_path:Path,equipment_id:str,original_name:str):
    reader=PdfReader(str(file_path)); pages=[]
    for i,p in enumerate(reader.pages):
        txt=(p.extract_text() or "").strip()
        if txt: pages.append({"page":i+1,"text":txt[:30000]})
    out={"equipment_id":equipment_id,"name":original_name,"pages":pages}
    dest=MANUALS/f"{equipment_id}.json"; dest.write_text(json.dumps(out,indent=2),encoding="utf-8")
    return {"equipment_id":equipment_id,"name":original_name,"pages_parsed":len(pages)}

def manual_search(equipment_id:str,query:str,limit:int=5):
    path=MANUALS/f"{equipment_id}.json"
    if not path.exists(): return []
    data=json.loads(path.read_text(encoding="utf-8"))
    terms=[t.lower().strip(".,:/()-") for t in query.split() if len(t)>3]
    scored=[]
    for p in data.get("pages",[]):
        low=p["text"].lower()
        score=sum(low.count(t) for t in terms)
        if score: scored.append((score,p))
    scored.sort(key=lambda x:x[0],reverse=True)
    return [{"manual":data["name"],"page":p["page"],"text":p["text"][:4500]} for _,p in scored[:limit]]
