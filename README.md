# Educational-Live-Demo · Interactive Labs

**Live page:** https://d2718281828nis.github.io/Educational-Live-Demo/ · [русская версия](https://d2718281828nis.github.io/Educational-Live-Demo/ru/)

[English](#english) · [Русский](#русский)

---

## English

A bilingual (EN/RU) hub of the browser-based labs that accompany the dissertation
**“Methods and tools for studying extreme events of complex systems based on graph neural networks”**
(Denis A. Andrikov; specialty 2.3.5 “Mathematical and software support of computing systems, complexes and computer networks”).

The labs demonstrate the **“when — where”** method on synthetic data: extreme value theory (POT/GPD) estimates
*when* an observation became extreme, a dependence graph is a testable hypothesis of how the event spreads, and a
graph model ranks the nodes by the probability of being *where* it started. Everything runs in the browser, with no
installation.

### Labs

| Lab | What you can do | Dissertation | Language |
|---|---|---|---|
| [Graph-EVT: interactive guide](https://d2718281828nis.github.io/EVT-educational-demo/index) | additive Hurst signal, 1-D vs n-D, POT/GPD alarm, source ranking, GNN vs GAT, agent pipeline | § 7.1.2, § 2.1, § 2.10; Thesis 1 | EN · RU |
| [Kuramoto propagation explorer](https://d2718281828nis.github.io/EVT-educational-demo/kuramoto/) | tune 12 coupled Kuramoto oscillators and watch a Hurst-coloured burst spread from `channel_00` | § 7.1.2, § 2.12; positive control | EN |
| [Reservoir computing explainer](https://d2718281828nis.github.io/ML-Reservoir_Computing/) ([RU](https://d2718281828nis.github.io/ML-Reservoir_Computing/ru/)) | feed-forward network vs echo state network and NG-RC, trained in the browser; link to control theory | § 2.17, § 3.12 | EN · RU |
| Catalog: [ai-is-out-there.github.io/#library](https://ai-is-out-there.github.io/#library) | all labs, including those outside the dissertation | — | — |

The page itself adds a small live demo: the ground truth of the synthetic benchmark of § 7.1.2 (pulse injected into
`channel_00` at sample 932, 75 samples long, delay 5 samples and attenuation 0.65 per ring step), with the EVT alarm
moments reported in the dissertation (r = 1 → sample 949, r = 2 → sample 959).

### Role in the dissertation

| | |
|---|---|
| Artifact | No. 5 — Interactive labs |
| Type | **Direct** |
| Used in | § 7.1.2; practical significance; item 7 of the specialty passport |
| Purpose | Visual demonstration of the “when — where” method and of a synthetic event spreading over a graph; supports item 7 of the specialty passport (human–machine interfaces, computer graphics, visualization) and is the basis for an act of implementation in the educational process |

### Related repositories

| Repository | Commit | Role |
|---|---|---|
| [Graph-EVT-agent](https://github.com/D2718281828nis/Graph-EVT-agent) | `465b231` | library: EVT detection (“when”), graph building and source ranking (“where”) |
| [EVT-educational-demo](https://github.com/D2718281828nis/EVT-educational-demo) | `7c3f9cb` | synthetic benchmarks with a known moment and source; hosts the guide and the Kuramoto explorer |
| [Extreme-Value-Theory-New-Approach](https://github.com/D2718281828nis/Extreme-Value-Theory-New-Approach) | `546ed9d` | code and reference results of the three examples of chapter 7 |
| [ML-Reservoir_Computing](https://github.com/D2718281828nis/ML-Reservoir_Computing) | — | echo state network of § 2.17; hosts the reservoir explainer |

### Repository layout

```
index.html        bilingual page (EN/RU switch, ?lang=en|ru)
ru/index.html     Russian entry point → ../?lang=ru
css/site.css      styles, light and dark themes
js/site.js        language/theme switches and the ring-propagation demo
.github/workflows/pages.yml   deploys the site to GitHub Pages
```

Run locally: `python3 -m http.server` in the repository root, then open http://localhost:8000/.

All data are synthetic. The labs illustrate the method and are not intended for engineering, financial or clinical decisions.

---

## Русский

Двуязычная (RU/EN) витрина браузерных лабораторий, сопровождающих диссертацию
**«Методы и средства исследования экстремальных событий сложных систем на основе графовых нейронных сетей»**
(Андриков Денис Анатольевич; специальность 2.3.5 «Математическое и программное обеспечение вычислительных систем, комплексов и компьютерных сетей»).

Лаборатории показывают метод **«когда — где»** на синтетических данных: теория экстремальных значений (POT/GPD)
оценивает, *когда* наблюдение стало экстремальным, граф зависимостей служит проверяемой гипотезой о путях
распространения события, а графовая модель ранжирует узлы по вероятности быть тем местом, *где* оно началось.
Всё работает в браузере без установки.

### Лаборатории

| Лаборатория | Что можно сделать | В диссертации | Язык |
|---|---|---|---|
| [Graph-EVT: руководство](https://d2718281828nis.github.io/EVT-educational-demo/index?lang=ru) | аддитивный сигнал по Хёрсту, 1-D и n-D, тревога POT/GPD, ранжирование источника, GNN и GAT, конвейер агента | § 7.1.2, § 2.1, § 2.10; Положение 1 | RU · EN |
| [Обозреватель Курамото](https://d2718281828nis.github.io/EVT-educational-demo/kuramoto/) | 12 связанных осцилляторов Курамото и распространение всплеска из `channel_00` | § 7.1.2, § 2.12; положительный контроль | EN |
| [Резервуарные вычисления](https://d2718281828nis.github.io/ML-Reservoir_Computing/ru/) | сеть прямого распространения против сети эхо-состояний и NG-RC, обучение в браузере; связь с ТАУ | § 2.17, § 3.12 | RU · EN |
| Каталог: [ai-is-out-there.github.io/#library](https://ai-is-out-there.github.io/#library) | все лаборатории, включая не относящиеся к диссертации | — | — |

На самой странице есть небольшое живое демо: эталон синтетического примера § 7.1.2 (импульс впрыснут в `channel_00`
с 932-го отсчёта, длится 75 отсчётов, задержка 5 отсчётов и ослабление в 0,65 раза на каждый шаг кольца) и моменты
тревоги EVT, приведённые в диссертации (r = 1 → 949-й отсчёт, r = 2 → 959-й).

### Место в диссертации

| | |
|---|---|
| Артефакт | № 5 — Интерактивные лаборатории |
| Тип | **Прямой** |
| Где используется | § 7.1.2; практическая значимость; п. 7 паспорта специальности |
| Зачем | Наглядная визуализация метода «когда — где» и распространения синтетического события по графу; подтверждение п. 7 паспорта специальности (человеко-машинные интерфейсы, компьютерная графика, визуализация) и основание для акта внедрения в учебный процесс |

### Связанные репозитории

| Репозиторий | Коммит | Роль |
|---|---|---|
| [Graph-EVT-agent](https://github.com/D2718281828nis/Graph-EVT-agent) | `465b231` | библиотека: детекция по ТЭЗ («когда»), построение графа и ранжирование источника («где») |
| [EVT-educational-demo](https://github.com/D2718281828nis/EVT-educational-demo) | `7c3f9cb` | синтетические эталоны с известными моментом и источником; на нём размещены руководство и обозреватель Курамото |
| [Extreme-Value-Theory-New-Approach](https://github.com/D2718281828nis/Extreme-Value-Theory-New-Approach) | `546ed9d` | код и эталонные результаты трёх примеров главы 7 |
| [ML-Reservoir_Computing](https://github.com/D2718281828nis/ML-Reservoir_Computing) | — | эхо-сеть § 2.17; на нём размещён разбор резервуарных вычислений |

Локальный запуск: `python3 -m http.server` в корне репозитория, затем откройте http://localhost:8000/.

Все данные синтетические. Лаборатории иллюстрируют метод и не предназначены для инженерных, финансовых или клинических решений.

---

MIT License · © 2026 Denis A. Andrikov
