
import uuid
from app.authdb import create_user,add_equipment,save_diagnostic_session,mark_diagnostic_outcome,export_user_data

def test_session_persistence_and_outcome():
    email=f"session-{uuid.uuid4()}@example.com"
    u=create_user(email,"password123")
    e=add_equipment(u["id"],{"name":"Session mower","category":"Small engine"})
    sid=save_diagnostic_session(u["id"],e["id"],"surges",{"history":[]},{"status":"ask","risk":{"level":"green"}})
    mark_diagnostic_outcome(u["id"],sid,"fixed")
    data=export_user_data(u["id"])
    match=[x for x in data["diagnostic_sessions"] if x["id"]==sid]
    assert len(match)==1
    assert match[0]["outcome"]=="fixed"
