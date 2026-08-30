
import os,uuid
from app.authdb import create_user,verify,add_equipment,list_equipment,add_repair,list_repairs

email=f"smoke-{uuid.uuid4()}@example.com"
u=create_user(email,"password123")
assert u
assert verify(email,"password123")
e=add_equipment(u["id"],{"name":"Smoke Test Mower","category":"Small engine"})
assert e["name"]=="Smoke Test Mower"
assert any(x["id"]==e["id"] for x in list_equipment(u["id"]))
r=add_repair(u["id"],{"equipment_id":e["id"],"equipment_name":e["name"],"symptom":"surges","history":[],"fix":"test","part":"","notes":""})
assert any(x["id"]==r["id"] for x in list_repairs(u["id"]))
print("DATABASE_SMOKE_OK")
