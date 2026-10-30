-- Seed for the §14.8 probes: sqlite3 app.db < app.sql
CREATE TABLE orders (id INTEGER PRIMARY KEY, tenant_id INTEGER, item TEXT);
INSERT INTO orders VALUES (1, 1, 'a');
INSERT INTO orders VALUES (2, 2, 'b');
CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, passwordHash TEXT);
INSERT INTO users VALUES (1, 'x@y', 'SECRET');
