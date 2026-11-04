# KvartoCRM 1.5.2

- Mobile Today agenda uses a responsive grid. Actions occupy a separate row; very narrow containers put time above the title. Desktop layout remains compact.
- Chart tooltips are smaller and dismiss during touch scrolling. Chart presets wrap; line and donut charts are retained.
- Dashboard loads non-deleted archived properties for historical deal labels. Current portfolio filters remain unchanged; recent properties exclude archived/sold records.
- No database migration or user data changes. Historical deals still require explicit direction and closing date before accounting inclusion.

Validation: 140 unit tests plus 2 pretests, ESLint, production build. Browser fixture checks: 15 width/font combinations (320/360/390/412/1440 and 16/20/24px), long titles and all action buttons, modal opening/closing, no overflow or API writes. Accounting browser regression covers archived address and editor link, separated totals, mortgage retry, five themes, touch tooltip dismissal. Screenshots inspected at 360px with increased font. Physical Android device not tested locally.
