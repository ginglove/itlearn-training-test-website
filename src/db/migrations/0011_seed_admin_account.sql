-- Migration 0011: seed the platform admin account (RSD v9 three-tier governance)
-- Login: platform_admin / Admin@123!  (change the password after first login)

INSERT INTO "users" ("id", "username", "password_hash", "full_name", "email", "role", "is_first_login")
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'platform_admin',
  '$2b$10$mdXCThX1wqNBxZuQvuOUbuvxNu1poz2uUEmnUKuA36o8J2o2qqTKu',
  'Platform Admin',
  'admin@example.com',
  'ADMIN',
  false
)
ON CONFLICT ("username") DO UPDATE SET "role" = 'ADMIN';
