# KIND SIGMA UA — Instagram Planner

Локальний планер запуску українського акаунту @kindsigma.ua — **15 постів, зібраних виключно з наявних фото/відео**.

## Що всередині

- **Дроп · 6 липня** — 3 пости, що засівають фід (GENESIS, HALIA, HALIA off-duty)
- **Далі — пост кожні 2–3 дні** (9 лип → 6 сер): 12 постів
- Кожен **слайд каруселі заповнений реальним фото** — плейсхолдерів немає
- Повні **українські caption-и** для кожного посту (voice бренду: без емодзі, без гео, завершення — availability + WWW.KINDSIGMA.COM)
- **Хештеги** на пост
- Формати: static · carousel · reel
- Статуси постів: Draft / Ready / Scheduled / Posted (зберігаються в LocalStorage браузера)
- Фільтри: формат · пілар · статус
- Два вʼюхи: Instagram-grid 3×3 і список

Розклад публікацій: Дроп 6 лип (p1–p3) · 9 · 12 · 14 · 17 · 19 · 22 · 24 · 27 · 29 лип · 1 · 3 · 6 сер.

## Запуск

З терміналу:

```bash
cd "$(dirname "$0")"   # або шлях до цієї теки planner/
python3 -m http.server 8765
```

Потім відкрий у браузері: http://localhost:8765

Онлайн-версія: https://gantik10.github.io/kind-sigma-ua-planner/

Для зупинки: `Ctrl+C` у тому ж терміналі.

## Файли

| Файл | Що це |
|---|---|
| `index.html` | UI |
| `app.js` | логіка рендеру + фільтри + LocalStorage |
| `styles.css` | стилі (warm-neutral палітра бренду) |
| `posts.json` | усі дані постів — редагуй тут якщо треба змінити текст/порядок/призначення |
| `images/` | реальні фото/відео з глобального @kindsigma (31 унікальний файл) |

## Як редагувати

Усі тексти і метадані — у `posts.json`. Відкрий, знайди потрібний пост по `id` (наприклад `d12`), зміни поле, збережи — оновити сторінку у браузері.

Структура одного посту:
```json
{
  "id": "d1",
  "order": 10,
  "phase": "week-1",
  "day": "1",
  "format": "reel",
  "pillar": "brand",
  "title": "LAUNCH Reel — magic transition",
  "image": "beauties-video.mp4",
  "placeholderText": null,
  "imageBrief": "Reel 7-12 сек: магічна transition між GENESIS → ACACIA → HALIA...",
  "caption": "Тепер у Києві. У Львові...",
  "hashtags": ["#kindsigma", "#kindsigmaua", ...]
}
```

## Заміна фото

Поклади нове фото в `images/` (будь-якою назвою), потім у відповідному пості в `posts.json` зміни поле `"image"` на нове ім'я.

## Експорт / план B

LocalStorage-статуси можна експортувати з DevTools:
```js
copy(localStorage.getItem('ks-ua-planner-status-v1'))
```

## TODO до фінальної публікації

- [ ] Native UA copywriter review (правки на тональність)
- [ ] Підтвердити фінальну ціну в гривнях (зараз 5 900 ₴)
- [ ] Підтвердити дати дропу/розкладу під реальний календар команди
