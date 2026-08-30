
from .authdb import create_user,verify,add_equipment,add_repair

def main():
    email="demo@repairpilot.local"; password="RepairPilotDemo123!"
    u=verify(email,password) or create_user(email,password,"tester")
    e=add_equipment(u["id"],{
        "name":"Demo Riding Mower","manufacturer":"Husqvarna","model":"YTH26V54",
        "serial":"","category":"Small engine","notes":"Seeded private-beta demo profile."
    })
    add_repair(u["id"],{
        "equipment_id":e["id"],"equipment_name":e["name"],"symptom":"Engine surges at no load",
        "history":[{"question":"Does partial choke change the surge?","answer":"No","risk":"green"}],
        "fix":"Demo confirmed repair record","part":"","notes":"Seed data only."
    })
    print("Demo data created.")
    print("email:",email)
    print("password:",password)
    print("Delete this account before any real beta launch.")

if __name__=="__main__":main()
