# KIND SIGMA UA — Instagram Planner

Локальний планер усіх 39 постів запуску українського акаунту @kindsigma.ua.

## Що всередині

- **9 pre-launch постів** (Day -5 → Day -1) — стартова 3×3 сітка
- **30 днів місячного календаря** (Day 1 → Day 30) = 24 фідових поста + 6 stories-only днів
- Повні **українські caption-и** для кожного посту
- **Хештеги** (10-12 на пост)
- **Брифи на фото / Reels** для дизайнера/фотографа
- Реальні фото з твоєї папки де можливо, плейсхолдери — де ні
- Статуси постів: Draft / Ready / Scheduled / Posted (зберігаються в LocalStorage браузера)
- Фільтри: формат · пілар · статус
- Два вʼюхи: Instagram-grid 3×3 і список

## Запуск

З терміналу:

```bash
cd "/Users/kirillgontovoy/Downloads/Kind Sigma/planner"
python3 -m http.server 8765
```

Потім відкрий у браузері: http://localhost:8765

Для зупинки: `Ctrl+C` у тому ж терміналі.

## Файли

| Файл | Що це |
|---|---|
| `index.html` | UI |
| `app.js` | логіка рендеру + фільтри + LocalStorage |
| `styles.css` | стилі (warm-neutral палітра бренду) |
| `posts.json` | усі дані постів — редагуй тут якщо треба змінити текст/порядок/призначення |
| `images/` | 34 реальних фото/відео з глобального @kindsigma |

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
- [ ] Фіксувати фінальну ціну в гривнях (зараз 5 900 ₴ як placeholder)
- [ ] Замінити плейсхолдери реальними фото (особливо пости 1, 4, 7, 9 з пре-лонч + Day 2, 4, 6, 10, 17, 20, 22, 24, 27, 30)
- [ ] Підставити реальні @handle українських інфлюенсерів у Day 25, 28
- [ ] Узгодити з Ahmed voice-over для Day 15 Reel
