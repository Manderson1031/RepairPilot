# RepairPilot V14 Authentication Note

Before external beta launch, RepairPilot now uses PBKDF2-HMAC-SHA256 password hashing with a random 16-byte salt and 310,000 iterations.

This removes the Passlib/bcrypt dependency from the authentication core.

Because no production beta account database has been launched yet, there is no production password migration burden. If an older local prototype database contains bcrypt hashes, those local users should simply be recreated or have their passwords reset before testing V14+.
