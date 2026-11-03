# Киношные совместные просмотры

Отдельная страница клуба Twiglles Киношная. Сетка фильмов ноября: кадр, название, короткое описание. Под каждым фильмом ряд серых кружков. Чтобы отметиться, человек нажимает на кружок и вписывает свой ник в Telegram. Кружок становится фирменным красным, а при наведении вытягивается в плашку с ником. По клику на чужую плашку открывается чат в Telegram. На телефоне первое касание показывает ник, второе открывает Telegram.

Даты премьер на карточках не показываются, чтобы не путать: день и кинотеатр для совместного просмотра назначают кураторы. Даты используются только для тихих перегородок между группами фильмов.

Справа панель «Не нашли нужный фильм?». В ней участники добавляют свой фильм, и он сразу появляется в сетке в группе «Предложили участники». Убрать фильм может только тот, кто его добавил.

Пока страница живёт отдельно от голосования и от «Идём в кино с клубом». Она использует те же цвета, шрифты, ту же базу Firebase и тот же id участника (`kino.voter`), так что потом её можно будет просто добавить вкладкой.

## Файлы

| Файл | Что внутри |
|---|---|
| `index.html` | страница для своего хостинга, отметки в Firebase |
| `artifact.html` | та же страница для ссылки на claude.ai, отметки в базе claude.ai |
| `style.css` | оформление, в том числе кружки, плашки и телефонная вёрстка |
| `app.js` | логика: сетка, кружки, ник, добавление фильмов, связь с базой |
| `films.js` | **список фильмов** |
| `config.js` | настройки: название сбора, сколько кружков показывать, Firebase |
| `stills/` | кадры из фильмов (с TMDB) |
| `benzin-semibold.woff` | шрифт плашки «Twiglles Киношная» |

Разметка в `index.html` и `artifact.html` одинаковая. Если меняете текст на странице, поменяйте его в обоих файлах.

## Две версии

**Свой хостинг** (`index.html`). Подходит для ссылки в Telegram: отметиться может любой, без входа. Человек опознаётся по браузеру, как в голосовании.

**claude.ai** (`artifact.html`), опубликована по ссылке https://claude.ai/artifact/2ESoGtAqgotc2NvuK3P35e. Отметиться может только тот, кому владелец дал доступ участника в claude.ai. Firebase там недоступен, поэтому отметки у двух версий не общие.

## Общие отметки: правила Firebase

Отметки хранятся в той же базе, что и голосование, в ветке `together`. Пока в правилах нет этой ветки, страница работает в **демо-режиме**: отметки видны только в вашем браузере, а вверху написано, что нужно добавить правила.

В Firebase → **Realtime Database → Rules** замените всё на это и нажмите **Publish**. Блоки `polls`, `dates` и `premieres` те же, что у голосования и премьер, добавился только `together`:

```json
{
  "rules": {
    "polls": {
      "$poll": {
        ".read": true,
        "votes": {
          "$film": {
            "$voter": {
              ".write": true,
              ".validate": "$voter.length <= 40 && (newData.val() === true || !newData.exists())"
            }
          }
        },
        "films": {
          "$film": {
            ".write": "!data.exists() || !newData.exists()",
            ".validate": "newData.child('title').isString() && newData.child('title').val().length > 0 && newData.child('title').val().length <= 120 && (!newData.child('poster').exists() || newData.child('poster').val().length < 400000)"
          }
        }
      }
    },
    "dates": {
      "$poll": {
        ".read": true,
        "answers": {
          "$voter": {
            ".write": "$voter.length <= 40",
            ".validate": "newData.hasChildren(['updatedAt', 'days']) && newData.child('updatedAt').isNumber()",
            "name": { ".validate": "newData.isString() && newData.val().length <= 60" },
            "same": { ".validate": "newData.isBoolean()" },
            "updatedAt": { ".validate": true },
            "days": {
              "$day": {
                ".validate": "$day.matches(/^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/) && newData.child('from').isNumber() && newData.child('to').isNumber() && newData.child('from').val() >= 0 && newData.child('to').val() <= 1440 && newData.child('from').val() < newData.child('to').val()",
                "from": { ".validate": true },
                "to": { ".validate": true },
                "$other": { ".validate": false }
              }
            },
            "$other": { ".validate": false }
          }
        }
      }
    },
    "premieres": {
      "$poll": {
        ".read": true,
        "going": {
          "$film": {
            "$voter": {
              ".write": "$film.matches(/^[0-9]{1,10}$/) && $voter.length <= 40",
              ".validate": "newData.hasChildren(['tg', 'at'])",
              "tg": { ".validate": "newData.isString() && newData.val().matches(/^[A-Za-z0-9_]{4,32}$/)" },
              "at": { ".validate": "newData.isNumber()" },
              "$other": { ".validate": false }
            }
          }
        }
      }
    },
    "together": {
      "$poll": {
        ".read": true,
        "going": {
          "$voter": {
            ".write": "$voter.length <= 40",
            ".validate": "newData.hasChildren(['tg', 'films', 'at'])",
            "tg": { ".validate": "newData.isString() && newData.val().matches(/^[A-Za-z0-9_]{4,32}$/)" },
            "at": { ".validate": "newData.isNumber()" },
            "films": {
              "$film": { ".validate": "$film.length <= 40 && newData.isNumber()" }
            },
            "$other": { ".validate": false }
          }
        },
        "added": {
          "$voter": {
            ".write": "$voter.length <= 40",
            "films": {
              "$film": {
                ".validate": "$film.length <= 40 && newData.hasChildren(['title', 'at'])",
                "title": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 80" },
                "about": { ".validate": "newData.isString() && newData.val().length <= 180" },
                "at": { ".validate": "newData.isNumber()" },
                "$other": { ".validate": false }
              }
            },
            "$other": { ".validate": false }
          }
        }
      }
    }
  }
}
```

Сразу после публикации обновите страницу: надпись про демо-режим исчезнет, и отметки станут общими.

## Как обновить список

Откройте `films.js`, скопируйте блок `{ ... }` одного фильма и поменяйте поля (подсказки в начале файла). `id` — номер фильма на Кинопоиске, к нему привязаны отметки, после старта его не меняйте. Кадр положите в `stills/`.

Новый месяц: замените список в `films.js` и поменяйте `pollId` в `config.js` (например на `"2026-12"`), тогда сбор начнётся с нуля, а ноябрьский останется в базе. Подпись «Ноябрь 2026» в шапке поменяйте в `index.html` и `artifact.html`.

## Посмотреть локально

```bash
python -m http.server 8743
```

Затем откройте http://localhost:8743. Если добавить к адресу `?demo`, отметки будут храниться только в браузере, даже когда база подключена.

## Опубликовать на claude.ai

Версия для claude.ai обновляется публикацией `artifact.html` вместе с `style.css`, `config.js`, `films.js`, `app.js`, `benzin-semibold.woff` и кадрами из `stills/` по той же ссылке. Попросите об этом Claude в этой папке.

## Ограничения

На своём хостинге человек опознаётся по браузеру, а ники видны всем, кто открыл страницу: в этом и смысл, чтобы участники могли найти друг друга. Ник никто не проверяет, вписать можно любой. Добавленные участниками фильмы тоже никто не проверяет: лишний можно удалить в Firebase вручную.
