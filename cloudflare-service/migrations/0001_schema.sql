CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  head_image TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 1,
  role INTEGER NOT NULL DEFAULT 2,
  mail TEXT NOT NULL DEFAULT '',
  referral_code TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_user_token ON user(token);
CREATE INDEX IF NOT EXISTS idx_user_username_password ON user(username, password);

CREATE TABLE IF NOT EXISTS system_setting (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_name TEXT NOT NULL UNIQUE,
  config_value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS item_icon_group (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  icon TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_icon_group_user_id ON item_icon_group(user_id);

CREATE TABLE IF NOT EXISTS item_icon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  icon_json TEXT NOT NULL DEFAULT '{}',
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  lan_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  open_method INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 9999,
  item_icon_group_id INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_icon_user_group ON item_icon(user_id, item_icon_group_id);

CREATE TABLE IF NOT EXISTS user_config (
  user_id INTEGER PRIMARY KEY,
  panel_json TEXT NOT NULL DEFAULT '{}',
  search_engine_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS module_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  value_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_module_config_user_name ON module_config(user_id, name);

CREATE TABLE IF NOT EXISTS notice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  display_type INTEGER NOT NULL DEFAULT 1,
  one_read INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL DEFAULT '',
  is_login INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_notice_display_type ON notice(display_type);

CREATE TABLE IF NOT EXISTS file (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  src TEXT NOT NULL DEFAULT '',
  user_id INTEGER NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  method INTEGER NOT NULL DEFAULT 0,
  ext TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_file_user_id ON file(user_id);

INSERT INTO user (username, password, name, status, role, mail)
SELECT 'admin@sun.cc', '579646aad11fae4dd295812fb4526245', 'admin@sun.cc', 1, 1, 'admin@sun.cc'
WHERE NOT EXISTS (SELECT 1 FROM user LIMIT 1);

INSERT INTO system_setting (config_name, config_value)
VALUES
  ('system_application', '{"emailSuffix":"","openRegister":false,"loginCaptcha":false,"webSiteUrl":""}'),
  ('disclaimer', ''),
  ('web_about_description', ''),
  ('panel_public_user_id', 'null')
ON CONFLICT(config_name) DO NOTHING;

CREATE TRIGGER IF NOT EXISTS trg_user_updated_at
AFTER UPDATE ON user
FOR EACH ROW
BEGIN
  UPDATE user SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_item_icon_group_updated_at
AFTER UPDATE ON item_icon_group
FOR EACH ROW
BEGIN
  UPDATE item_icon_group SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_item_icon_updated_at
AFTER UPDATE ON item_icon
FOR EACH ROW
BEGIN
  UPDATE item_icon SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_module_config_updated_at
AFTER UPDATE ON module_config
FOR EACH ROW
BEGIN
  UPDATE module_config SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_notice_updated_at
AFTER UPDATE ON notice
FOR EACH ROW
BEGIN
  UPDATE notice SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_file_updated_at
AFTER UPDATE ON file
FOR EACH ROW
BEGIN
  UPDATE file SET updated_at = datetime('now') WHERE id = OLD.id;
END;
