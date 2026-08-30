
CREATE TABLE IF NOT EXISTS password_reset_tokens(
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blobs(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  equipment_id TEXT,
  category TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  backend TEXT NOT NULL,
  object_path TEXT NOT NULL,
  created INTEGER NOT NULL
);
