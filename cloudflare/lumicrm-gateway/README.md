# KvartoCRM Cloudflare gateway

Бесплатный шлюз проксирует запросы браузера и приложений к Supabase. Данные и ключи в Cloudflare не сохраняются.

Основной адрес: `https://lumicrm.pages.dev`

Запросы к `/auth/v1`, `/rest/v1`, `/storage/v1`, `/realtime/v1` и `/functions/v1` обслуживаются Pages Functions через адаптер `pages.js`.

Резервный Worker: `https://lumicrm-gateway.denzotrail.workers.dev`.

Общая безопасная логика шлюза находится в `worker.js` и используется обоими вариантами публикации.
