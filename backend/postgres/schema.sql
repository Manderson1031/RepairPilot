CREATE SCHEMA IF NOT EXISTS repairpilot;
SET search_path TO repairpilot, public;

CREATE TABLE IF NOT EXISTS users(
 id text PRIMARY KEY,email text UNIQUE NOT NULL,password_hash text NOT NULL,role text DEFAULT 'tester',created bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS invite_codes(
 code text PRIMARY KEY,created_by text,max_uses integer,uses integer DEFAULT 0,active integer DEFAULT 1,created bigint
);
CREATE TABLE IF NOT EXISTS equipment_v2(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,name text NOT NULL,
 manufacturer text,model text,serial text,category text,notes text,created bigint
);
CREATE TABLE IF NOT EXISTS repairs_v2(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,equipment_id text,
 equipment_name text,symptom text,history_json text,fix text,part text,notes text,saved bigint,updated bigint
);
CREATE TABLE IF NOT EXISTS manuals_v2(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,equipment_id text NOT NULL,
 name text NOT NULL,pages_json text NOT NULL,created bigint
);
CREATE TABLE IF NOT EXISTS image_history(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,equipment_id text,
 filename text,description text,analysis_json text,created bigint
);
CREATE TABLE IF NOT EXISTS feedback(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,session_id text,rating integer,
 success integer,comment text,created bigint
);
CREATE TABLE IF NOT EXISTS review_queue(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,equipment_id text,
 session_json text,risk_level text,status text,review_note text,created bigint,updated bigint
);
CREATE TABLE IF NOT EXISTS audit_log(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,event text,entity_type text,
 entity_id text,detail_json text,created bigint
);
CREATE TABLE IF NOT EXISTS password_reset_tokens(
 token text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires bigint,used integer DEFAULT 0,created bigint
);
CREATE TABLE IF NOT EXISTS blobs(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,equipment_id text,category text,
 filename text,content_type text,backend text,object_path text,created bigint
);
CREATE TABLE IF NOT EXISTS diagnostic_sessions(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,equipment_id text,symptom text,
 status text,risk_level text,request_json text,response_json text,outcome text DEFAULT '',created bigint,updated bigint
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_user_updated ON diagnostic_sessions(user_id,updated);
CREATE INDEX IF NOT EXISTS idx_diagnostic_outcome ON diagnostic_sessions(outcome,status);
CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied bigint);
CREATE INDEX IF NOT EXISTS idx_equipment_user ON equipment_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_repairs_user ON repairs_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_manuals_user_equipment ON manuals_v2(user_id,equipment_id);
CREATE INDEX IF NOT EXISTS idx_images_user_equipment ON image_history(user_id,equipment_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON review_queue(status);
CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_log(user_id,created);


REVOKE ALL ON SCHEMA repairpilot FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA repairpilot FROM anon, authenticated;
