-- Push notifications served the Flutter app, which was dropped in September
-- 2026. Nothing registers a token or sends a push any more, and the API module
-- that owned this table is gone. The rows are FCM tokens for retired devices.
DROP TABLE IF EXISTS "DeviceToken";
