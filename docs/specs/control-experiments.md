# Контрольні експерименти: скіл змінює те, що бачить агент

Критерії ДЗ №2: **16** (імпортований скіл у нового агента), **17** (Test Quality),
**18** (API Contract), а заодно **19–20** (блок скілів і його токени в трейсі).

Ідея кожного експерименту: один і той самий PR, один і той самий агент, ревʼю
двічі — **без** скіла і **зі** скілом. Різниця у знахідках пояснюється лише скілом.

## 0. Підготовка (один раз)

1. Закомітьте поточну роботу й запуште гілку.
2. **Імпорт `deprecation-policy` з URL** (кр. 16, 43). Коли файл уже на GitHub:
   - Skills → **Add Skill → Import from URL**, вставте посилання на файл
     `docs/skills/deprecation-policy.md` у вашому репо. Підійде і звичайне
     `https://github.com/VasylYeleiko/dev-digest/blob/<гілка>/docs/skills/deprecation-policy.md`:
     сервер сам перетворить його на raw.
   - Прев'ю → **Save**. Скіл збережеться як `imported_url` і **вимкненим**.
   - На сторінці скіла: перегляньте тіло → увімкніть тогл.
   - Agents → **API Contract Reviewer** → Skills → прив'яжіть `deprecation-policy`.
3. Перевірте, що в **API Contract Reviewer** на вкладці Config обрана модель, до
   якої у вас є ключ (seed ставить модель за замовчуванням).

## Експеримент 18: API Contract Reviewer і breaking change

Патч [`experiments/api-contract-breaking.patch`](experiments/api-contract-breaking.patch)
маскується під «tidy-up», але ламає клієнтів двічі:
- `GET /skills/:id/versions` → `GET /skills/:id/history`: клієнт отримує 404;
- поле відповіді `created_at` → `saved_at`: клієнт читає `undefined`.

```bash
git switch -c exp/api-contract-breaking
```
```bash
git apply docs/specs/experiments/api-contract-breaking.patch
```
```bash
git commit -am "refactor(skills): clearer naming for the version history endpoint"
```
```bash
git push -u origin exp/api-contract-breaking
```

Відкрийте PR на GitHub (не мерджте його), підтягніть його в DevDigest (Pull Requests → Refresh).

| Прогін | Налаштування | Очікування |
|---|---|---|
| A | API Contract Reviewer → Skills: **зніміть** усі 4 скіли | `approve` або лише дрібниці: без політики агент не вважає перейменування критичним |
| B | **Прив'яжіть** `breaking-change` (+ решту) | `request_changes` з CRITICAL на `routes.ts` (зникла `/versions`) і на `helpers.ts` (`created_at` → `saved_at`) |

Після прогону B відкрийте трейс (PR → Agent runs → іконка трейсу): у складанні
промпта є окремий блок **Skills** зі своєю кількістю токенів (кр. 19). Вимкнений
скіл у блоці не з'являється (кр. 20).

## Експеримент 17: Test Quality Reviewer і тест лише на happy path

Патч [`experiments/test-quality-happy-path.patch`](experiments/test-quality-happy-path.patch)
додає `skillSlug()` з чотирма гілками (порожній результат, коротка назва, обрізання
на межі слова, обрізання без дефіса), а тест покриває тільки одну.

```bash
git switch main
```
```bash
git switch -c exp/test-quality-happy-path
```
```bash
git apply docs/specs/experiments/test-quality-happy-path.patch
```
```bash
git commit -am "feat(skills): slug helper for exported skill folders"
```
```bash
git push -u origin exp/test-quality-happy-path
```

| Прогін | Налаштування | Очікування |
|---|---|---|
| A | Test Quality Reviewer → Skills: **зніміть** `branch-coverage-rubric`, `corner-case-checklist` | менше знахідок або жодної |
| B | **Прив'яжіть** обидва | знахідки на непокриті гілки `skillSlug` (порожній рядок → `'skill'`, обрізання) і межові випадки (рівно `maxLength`, без дефіса) |

> ⚠️ Системний промпт Test Quality Reviewer (з L02) сам детально описує
> «uncovered branches» і «corner cases», тож прогін A може знайти гілки й без
> скілів. Якщо так станеться, різницю видно у **кількості та конкретиці** знахідок
> (скіли додають перелік межових входів). Для чистого експерименту можна тимчасово
> звузити промпт агента (Config → System prompt), як зроблено в API Contract
> Reviewer, де вся політика живе у скілах.

## Прибирання

Закрийте обидва PR без мерджу й видаліть гілки: патчі навмисно ламають API
(`/versions`) і лишають непокритий код.
