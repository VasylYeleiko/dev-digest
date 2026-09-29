# Conventions Extractor + URL import з перевіркою на prompt injection — план імплементації

Статус: **реалізовано** (2026-09-26), етапи 0–7 + 6.5. Опис фічі:
[conventions.md](conventions.md). Контрольні експерименти: [control-experiments.md](control-experiments.md).

## Підсумок і відхилення від плану

| Етап | Статус | Відхилення / доповнення |
|---|---|---|
| 0 Контракти + схема | ✅ | Дві міграції (`0012_conventions_triage`, `0013_conventions_drop_accepted`): в одній drizzle-kit інтерактивно питає про перейменування `accepted → status` |
| 1 Модуль conventions | ✅ | **Стратифікована вибірка** (round-robin між пакетами й теками, без прихованих тек) замість сирого топ-12: реальний скан показав, що топ зсунутий в одну підсистему. Знайдено й виправлено порожній граф repo-intel (окремий фікс depgraph) |
| 2 Скіл repo-conventions | ✅ | Вже прив'язані агенти пропускаються, бо `linkSkill` перемістив би скіл у кінець промпту |
| 3 UI Conventions | ✅ | Бектики з відповіді моделі рендеряться як inline-код; `approxTokens` і `slugFilename` перенесено в `client/src/lib` (другий споживач) |
| 4 Детектор injection | ✅ | Скіл із injection **зберігається вимкненим**; відмова лише на явне ввімкнення (`false → true`). `server/AGENTS.md` уточнено: `INJECTION_GUARD` для входів PR, сканер для тіл скілів |
| 5 Імпорт з URL | ✅ | SSRF-захист у три шари (URL, DNS-lookup з перевіреною адресою, кожен redirect); GitHub blob/gist → raw |
| 6 API Contract Reviewer | ✅ | Промпт агента — тонка оболонка, політика в скілах (щоб експеримент 18 показував різницю). PR і прогони експериментів 16–18 — дія автора |
| 6.5 Прогалини L02 | ✅ | Кр. 10, 11, 12, 22, 23, 24, 31, 33, 34 + лічильник скілів на плитці агента (32) |
| 7 Документація | ✅ | цей файл, `conventions.md`, INSIGHTS, pr-self-review |

---

Початковий план (як погоджено до реалізації):
Гілка: `L02` (без комітів — коміти робить автор).
Критерії: `hw2-criteria.md` №38–53 (conventions), №17, 18, 43 (API Contract Reviewer).

## Рішення, прийняті з автором

| # | Питання | Рішення |
|---|---|---|
| A | Референсний коміт `641b637` в історії | Не дивимось взагалі; звіримося після завершення |
| B | `client/src/vendor/ui/nav.ts` (do-not-touch) | Редагуємо, як у L02 |
| C | Назва скіла | Дефолт `repo-conventions`, редагується в модалці; повторний Create → нова версія того ж скіла |
| D | Прив'язка до агента | Мультиселект агентів у модалці, один обраний за замовчуванням |
| E | Бонус | Імпорт скіла з URL + детектор prompt injection (блокує enable і link, доки тіло не виправлено) |
| F | Тестовий репо | `VasylYeleiko/dev-digest` (склоновано, проіндексовано: 312 файлів) |
| G | Виконання скану | Синхронний `POST` + спінер |
| — | Критерії 17/18/43 | Робимо в цій задачі (Етап 6) |

Рішення за замовчуванням: re-scan замінює лише `pending`; відхилені зникають зі списку й не повертаються;
evidence перевіряється з нормалізацією пробілів і корекцією номера рядка; Edit — inline;
«Run Scan» у порожньому стані, «Re-scan» після першого скану.

## Контекст із INSIGHTS

**server**
1. Delete-then-insert без unique key → транзакція + `advisoryXactLock` (re-scan pending).
2. Опційний body у Fastify приходить як `null` → `.nullish()`.
3. Прив'язку вимкненого скіла відхиляє сервер (`AgentStore.disabledSkillIds`, 422) — injection-блок будуємо так само.

**client**
1. `vendor/shared/contracts/*` байт-ідентичні з сервером, із `.js`-розширеннями.
2. `vendor/ui` не чіпати: `Dropdown` не вміє мультиселект (локальне меню), `Checkbox` без `disabled` (`onChange={undefined}` + dimmed row).
3. UI-рядки в `messages/en/*.json`; `conventions.json` уже є в стартері — розширюємо.

## Скіли за папками (джерело — `.claude/skills/pr-self-review/routing.json`)

| Папка / файли | Скіли |
|---|---|
| `server/src/modules/**`, `adapters/**`, `platform/**` | `onion-architecture`, `security`, `typescript-expert` |
| `server/src/**/routes.ts` | + `fastify-best-practices` |
| `server/src/**/repository.ts`, `db/**` | + `drizzle-orm-patterns` |
| `server/src/db/schema/**`, міграції | + `postgresql-table-design` |
| `**/vendor/shared/contracts/**` | `zod` |
| `client/src/**/*.{ts,tsx}` | `frontend-ui-architecture`, `security`, `typescript-expert` |
| `client/src/**/*.tsx`, `use*.ts` | + `react-best-practices` |
| `client/src/app/**/page.tsx` | + `next-best-practices` |
| `client/**/*.test.tsx` | `react-testing-library` |

---

## Етап 0 — Контракти + схема + міграція

**Скіли:** `zod`, `postgresql-table-design`, `drizzle-orm-patterns`.

- `server/src/db/schema/knowledge.ts` — розширити `conventions`:
  `category text NOT NULL`, `status text NOT NULL DEFAULT 'pending'` + CHECK (`pending|accepted|rejected`, замінює `accepted`),
  `evidence_line_start int`, `evidence_line_end int`, `created_at`/`updated_at timestamptz`,
  індекс `(repo_id, status)`, індекс на `workspace_id`.
- Нова таблиця `convention_scans`: `id uuid`, `workspace_id`, `repo_id` (FK + індекс), `model`, `sample_files jsonb`,
  `proposed int`, `dropped int`, `cost_usd`, `created_at` — для «Detected from N sample files · last scan …»
  і статистики evidence gate.
- Міграція: `cd server && pnpm db:generate --name=conventions_triage` (без ручних правок SQL).
- `server/src/vendor/shared/contracts/conventions.ts` (+ байт-ідентичне дзеркало в `client/`), експорт у barrel:
  `ConventionCategory`, `ConventionStatus`, `Convention`, `ConventionScan`, `ConventionsResponse { scan, items }`,
  `UpdateConventionRequest`, `ConventionSkillDraft`, `CreateConventionsSkillRequest`.
- `PluginConvention.accepted` лишається (виводиться з `status`).

## Етап 1 — Серверний модуль `modules/conventions/`

**Скіли:** `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `security`, `zod`, `typescript-expert`.

Файли (за шаблоном onion): `types.ts`, `ports.ts`, `constants.ts`, `helpers.ts` (+ `evidence.ts`, `sampling.ts`),
`llm-schema.ts`, `repository.ts`, `service.ts`, `compose.ts`, `routes.ts`, `index.ts`; реєстрація в `modules/index.ts`.

`ConventionsServiceDeps` (лише порти):
`ConventionStore`, `RepoIntel` (фасад), `SourceFiles`, `Pick<RepoStore,'getById'>`, `LLMProviderResolver`,
`FeatureModelResolver` (реалізує settings), `SkillWriter` (реалізує skills), `AgentSkillLinker` (реалізує agents).
Порти від інших модулів оголошуються в `conventions/ports.ts`; wiring — у `compose.ts`.

Пайплайн (модель — лише в середній стадії):

1. **SAMPLE (чистий код, кр. 39)** — кандидати конфігів (`tsconfig*.json`, `eslint.config.*`, `.eslintrc*`,
   `.prettierrc*`, `prettier.config.*`, `.editorconfig`, `biome.json`, `package.json`) у корені та корені кожного пакета
   (пакети виводимо з проіндексованих шляхів) через `SourceFiles.read` + `repoIntel.getConventionSamples(repoId, 12)`.
   Ліміт рядків/байтів на файл, рендер із нумерацією рядків.
2. **PROPOSE (один structured-виклик, кр. 40, 53)** — модель з `resolveFeatureModel(ws, 'conventions')`;
   схема `{ category, rule, evidence: { file, line_start, line_end, snippet }, confidence }[]`;
   вміст файлів — недовірені дані в явних межах (захист від injection через код репо).
3. **VERIFY (код)** — файл ∈ відібраних (захист від path traversal), існує; нормалізований сніпет реально є у файлі;
   зсув рядка → корекція; вигаданий/тривіальний → відкинути. Сніпет у UI — з файлу, не з відповіді моделі.

Персистентність: транзакція + `advisoryXactLock(tx, 'conventions:<repoId>')`; видаляємо лише `pending`;
дублікати вже accepted/rejected (нормалізований текст правила) не вставляємо; пишемо рядок `convention_scans`.

Роути (workspace-scoped, тонкі хендлери):

| Метод | Шлях | Що |
|---|---|---|
| GET | `/repos/:id/conventions` | останній скан + pending/accepted (rejected приховані — кр. 48) |
| POST | `/repos/:id/conventions/extract` | синхронний скан (кр. 38); 409 якщо не склоновано/не проіндексовано; 502 при помилці LLM |
| PATCH | `/conventions/:id` | accept / reject / inline-правка `rule`, `category` |

Тести: unit — evidence gate (зсув рядка, вигаданий сніпет, файл поза вибіркою), вибір конфігів;
`*.it.test.ts` — extract з `MockLLMProvider.structuredBySchema`, re-scan зберігає accepted/rejected, reject переживає reload.

## Етап 2 — Скіл `repo-conventions` + лінк до агентів

**Скіли:** `onion-architecture`, `fastify-best-practices`, `zod`.

| Метод | Шлях | Що |
|---|---|---|
| POST | `/repos/:id/conventions/skill-draft` | markdown-тіло з accepted (нічого не зберігає) |
| POST | `/repos/:id/conventions/skill` | create або нова версія `repo-conventions` (`type: convention`, `source: extracted`, `evidence_files`) + link до обраних агентів (кр. 42) |

- Складання тіла — чиста функція (`helpers.ts`), формат як на скріншоті 2 (заголовок, інструкція цитувати `file:line`, секція на правило з evidence).
- Лінкування — через `AgentSkillLinker` (під капотом `AgentsService.linkSkill`, з його перевірками).
- Тести: it — create + link, повторний create → версія 2, не дубль.

## Етап 3 — Клієнт: сторінка Conventions

**Скіли:** `frontend-ui-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `security`.

- `client/src/vendor/ui/nav.ts`: пункт **Conventions** у SKILLS LAB → `/repos/:repoId/conventions` (кр. 44).
- `client/src/lib/hooks/conventions.ts` — `conventionKeys` + `useConventions`, `useExtractConventions`,
  `useUpdateConvention`, `useConventionSkillDraft`, `useCreateConventionsSkill` (не додавати в barrel `hooks/index.ts`).
- `client/src/app/repos/[repoId]/conventions/page.tsx` — тонка сторінка.
- `_components/ConventionsView/` — порожній стан з **Run Scan**, хедер з **Re-scan** (кр. 45), «N of M accepted»,
  кнопка **Create skill** після ≥1 accept (кр. 50).
- `_components/ConventionCard/` — правило, категорія, `file:line`, сніпет, confidence-бар,
  **Accept / Reject / Edit**, Edit inline (кр. 46, 47, 49).
- `_components/CreateConventionsSkillModal/` — банер «Merged from N accepted conventions…», Name, Description, Type,
  Enabled, редактор тіла з лічильником токенів, мультиселект агентів (локальне меню), Cancel / Create (кр. 41, 51);
  після Create — інвалідація кешу скілів (кр. 52).
- `messages/en/conventions.json` — розширити.
- Settings → Models → Conventions — рядок уже є, перевірити dropdown із пошуком (кр. 53).
- Тести RTL: `ConventionCard` (accept/reject/inline edit), поява Create skill, модалка (поля, submit).

## Етап 4 — Детектор prompt injection (для всіх скілів)

**Скіли:** `security`, `onion-architecture`, `zod`, `frontend-ui-architecture`, `react-best-practices`, `react-testing-library`.

- `server/src/platform/prompt-injection.ts` — чиста детермінована функція (shared kernel), повертає `{ rule, line, excerpt }[]`.
  Патерни: `ignore (all) previous/prior instructions`, «you are now…», рядки-імітації ролей (`SYSTEM:`, `assistant:`),
  «override … safety/guidelines», «always approve / score 100», «never flag/mention security»,
  «output/reveal system prompt», невидимі/bidi Unicode-символи, інструкції в HTML-коментарях.
- DTO `Skill.injection = { detected, findings[] }` — рахується під час читання з поточного тіла (без колонки в БД),
  прапорець зникає, коли тіло виправлено.
- Сервер: create/update з injection → `enabled=false` примусово; `enabled=true` на такому скілі → 422;
  `setSkills`/`linkSkill` відхиляють (422); `resolveForAgent` відсіює (defense in depth).
  Скіл із конвенцій теж проходить сканер.
- Клієнт: `src/components/InjectionBadge/` (2 споживачі); банер «INJECTION DETECTED — DO NOT ENABLE» на `/skills/:id`,
  вимкнений тогл; бейдж на `SkillCard`; червоний рядок + неможливість прив'язки в Skills-табі агента.
- Тести: unit сканера (включно з текстом зі шкідливого gist), it — не можна enable/link, RTL — банер і вимкнений тогл.

## Етап 5 — Імпорт скіла з URL

**Скіли:** `security`, `onion-architecture`, `fastify-best-practices`, `zod`, `react-best-practices`, `react-testing-library`.

- Порт `HttpFetcher` у `server/src/vendor/shared/adapters.ts`; адаптер `server/src/adapters/http/`;
  getter + override у `Container`; мок у `adapters/mocks.ts`.
- SSRF-захист: лише `https`; DNS-резолв і відмова для private/loopback/link-local; перевірка кожного redirect;
  таймаут; ліміт `MAX_IMPORT_BYTES`; лише text/markdown; `github.com/.../blob/...` → raw.
- `POST /skills/import-url { url }` → прев'ю (`parseSkillFile`) + звіт injection, без збереження.
  Підтвердження → create з `source: 'imported_url'`, `enabled=false`.
- `UrlTab` у `AddSkillDrawer`: поле URL → Fetch → прев'ю з попередженнями → Import. Попередження injection — і в прев'ю імпорту з файлу.
- Тести: unit — нормалізація URL, SSRF-guard; it — import-url з мок-фетчером; RTL — флоу `UrlTab`.

## Етап 6 — API Contract Reviewer (кр. 17, 18, 43)

**Скіли:** `onion-architecture`, `drizzle-orm-patterns` (seed).

- Агент **API Contract Reviewer** у `server/src/db/seed.ts` (ідемпотентно) + `docs/agent-prompts/api-contract-reviewer.md`.
- Seed-скіли `breaking-change`, `response-schema`, `semver-discipline` — директивний опис + приклад «добре/погано».
- `deprecation-policy` — у `docs/skills/deprecation-policy.md`, імпорт через URL (демо Етапу 5).
- Контрольні експерименти 17/18: готую гілки й diff-и; PR на GitHub створює автор.

## Етап 7 — Перевірка й завершення

- Ручна перевірка в браузері на `VasylYeleiko/dev-digest`: скан → accept/reject/edit → Create skill → скіл на `/skills` і в агента;
  імпорт шкідливого gist → блок → виправлення → прив'язка.
- `docs/specs/conventions.md` — продуктові покращення (реалізувати 1–2, якщо лишиться час):
  поширеність правила («11/12 файлів») замість самооцінки моделі; детерміновані правила з конфігів;
  пошук counter-evidence; кілька evidence на правило; сигнал з accepted/dismissed findings.
- `pnpm typecheck` + `pnpm test` у `server` і `client`; `/engineering-insights`; `/pr-self-review`.
