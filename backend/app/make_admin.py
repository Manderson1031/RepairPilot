
import sys
from .authdb import connect

def main():
    if len(sys.argv)!=2:
        raise SystemExit("Usage: python -m app.make_admin email@example.com")
    email=sys.argv[1].lower().strip()
    with connect() as c:
        row=c.execute("SELECT id,email FROM users WHERE email=?",(email,)).fetchone()
        if not row: raise SystemExit("No user with that email. Register the account first.")
        c.execute("UPDATE users SET role='admin' WHERE id=?",(row["id"],))
    print(f"Admin role granted to {email}")

if __name__=="__main__": main()
