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

The page itself gives a short visual review of the “when — where” task, the methods M1–M9 and the harness H0–H10
(section 2), followed by a worked synthetic example (section 3).

**One sensor, five nodes** (section 3 of the page): from a single observed series to the answer “when — where”.
A Hurst-coloured burst of duration *D* starts at one of nodes A–D and reaches every node along the fastest path of the
graph (delay τ and gain w per edge). Each node has its own rhythm (characteristic frequency); the sensor at E records
their sum — the additive input of the guide (periodic + stochastic + fractal). By Theorem 2.18.1 one channel cannot tell
the source (O = {E} leaves all 10 node pairs unresolved), so the harness runs in two stages: **1-D EVT** (H7, H0, H1)
decides that an extreme event happened; a **structural analysis** of the background finds the nodes (spectral peaks
named through the object dictionary), the edges (structural graph) and an **n-D series** (Morlet envelopes, one per
node), after which the identifiability gate is re-checked; the **n-D path of Graph-EVT-agent** (`detect`,
`build_baseline_graph`, `rank_source`, ported from the guide) answers when and where, next to an arrival-time estimate
(statement 2.18.3). The page compares this with the 3σ rule on the raw series and per channel, verifies it by Monte Carlo
with Wilson intervals, three graph hypotheses (Δ_G) and a specification grid, and ends with a number check and a manifest.
With the defaults (20 seeds × 4 sources): true source in 77 of 80 runs, Wilson [0.90; 0.99], onset error median
+16 samples, no alarm in 20 event-free series; the 3σ rule alarms in 16 of 20 event-free series and on the raw series can
only point at the sensor; structural, functional and empty graphs give the same answer (Δ_G ≈ 0).
Interactive extras: a frequency slider per node with each node’s own signal around the event, fixed axes in the input
step, and an ARL₀ figure for the kσ rule (α ≈ 0.0027 at 3σ → ARL₀ ≈ 370; with r exceedances in a row ARL₀ = μ_r(α)),
whose k and r also drive the 3σ baseline.
The functional graph is learned from a separate identification record (length and excitation are parameters) by one of six
methods with parameters: ar, corr, partial, xcorr, prewhitened xcorr, conditional Granger. Pairwise measures stay near
J ≈ 0.6 even without noise; conditional Granger recovers the structure (J ≈ 0.94 on average with the defaults).

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
js/site.js        language/theme switches and the Kuramoto card thumbnail
js/onedim-core.js numerics of section 3 (generator, 1-D EVT, structural analysis, n-D Graph-EVT-agent port); runs in Node too
tests/port_check.js           checks the JS graph methods against Graph-EVT-agent (Python): node tests/port_check.js
tests/make_graph_reference.py regenerates tests/fixtures/graph_methods_reference.json from Graph-EVT-agent
tests/experiments.js          reruns the page's Monte Carlo (seeds 1001–1020 × 4 sources) and spec grid: node tests/experiments.js --check → results/onedim_summary.json
js/onedim.js      section 3: charts and controls
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

На самой странице — короткий наглядный обзор задачи «когда — где», методов М1–М9 и средств H0–H10 (раздел 2)
и разобранный синтетический пример (раздел 3).

**Один датчик, пять узлов** (раздел 3 страницы): от одного наблюдаемого ряда к ответу «когда — где». Всплеск по Хёрсту
длительностью *D* зарождается в одном из узлов A–D и приходит в каждый узел по самому быстрому пути графа (на ребре
задержка τ и коэффициент w). У каждого узла свой ритм (характерная частота); датчик в E записывает их сумму — аддитивный
вход руководства (периодика + стохастика + фрактал). По теореме 2.18.1 один канал не различает источник (при O = {E} не
разрешена ни одна из 10 пар узлов), поэтому конвейер работает в два этапа: **одномерная EVT** (H7, H0, H1) устанавливает,
что произошло экстремальное событие; **структурный анализ** фона находит узлы (спектральные пики, названные по словарю
объекта), рёбра (структурный граф) и **многомерный ряд** (огибающие Морле, по одной на узел), после чего ворота
идентифицируемости проверяются заново; **n-D-ветвь Graph-EVT-agent** (`detect`, `build_baseline_graph`, `rank_source`,
перенесены из руководства) отвечает, когда и где, рядом с оценкой по временам прихода (утверждение 2.18.3). Страница
сравнивает это с правилом 3σ по сырому ряду и по каналам, проверяет методом Монте-Карло с интервалами Уилсона, тремя
гипотезами графа (Δ_G) и сеткой спецификаций и завершается сверкой чисел и manifest. При настройках по умолчанию
(20 затравок × 4 источника): истинный источник найден в 77 из 80 опытов, Уилсон [0,90; 0,99], медиана ошибки начала
+16 отсчётов, ни одной тревоги в 20 рядах без события; правило 3σ даёт тревогу в 16 из 20 рядов без события и по сырому
ряду указывает только на датчик; структурный, функциональный и пустой графы дают один ответ (Δ_G ≈ 0).
Интерактивные дополнения: слайдер частоты каждого узла с собственным сигналом узла около события, фиксированные оси
на шаге входа и рисунок ARL₀ для правила kσ (при 3σ α ≈ 0,0027 → ARL₀ ≈ 370; при r превышениях подряд ARL₀ = μ_r(α));
его k и r управляют и базовым правилом 3σ.
Функциональный граф оценивается по отдельной идентификационной записи (длина и возбуждение — параметры) одним из шести
методов с параметрами: ar, corr, partial, xcorr, выбеленный xcorr, условная причинность по Грейнджеру. Попарные меры
остаются около J ≈ 0,6 даже без шума; условная причинность по Грейнджеру восстанавливает структуру (в среднем J ≈ 0,94
при настройках по умолчанию).

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

MIT License · © 2026 Denis A. Andrikov · ORCID [0000-0003-0359-0897](https://orcid.org/0000-0003-0359-0897)
