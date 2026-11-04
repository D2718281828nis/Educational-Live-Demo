# Educational-Live-Demo · Interactive Labs

**Live page:** https://d2718281828nis.github.io/Educational-Live-Demo/ · [русская версия](https://d2718281828nis.github.io/Educational-Live-Demo/ru/)

[English](#english) · [Русский](#русский)

---

## English

A bilingual (EN/RU) hub of the browser-based labs that accompany the dissertation
**“Methods and tools for studying extreme events of complex systems based on graph neural networks”**
(Denis A. Andrikov).

The labs demonstrate the **“when — where”** method on synthetic data: extreme value theory (POT/GPD) estimates
*when* an observation became extreme, a dependence graph is a testable hypothesis of how the event spreads, and a
graph model ranks the nodes by the probability of being *where* it started. Everything runs in the browser, with no
installation.

### Labs

| Lab | What you can do | Dissertation | Language |
|---|---|---|---|
| [Graph-EVT: interactive guide](https://d2718281828nis.github.io/EVT-educational-demo/index) | additive Hurst signal, 1-D vs n-D, POT/GPD alarm, source ranking, GNN vs GAT, agent pipeline | § 2.9, § 3.7, § 7.1; Thesis 1 | EN · RU |
| [Kuramoto propagation explorer](https://d2718281828nis.github.io/EVT-educational-demo/kuramoto/) | tune 12 coupled Kuramoto oscillators and watch a Hurst-coloured burst spread from `channel_00` | § 2.9, § 3.7 (Fig. 6–7); positive control | EN |
| [Reservoir computing explainer](https://d2718281828nis.github.io/ML-Reservoir_Computing/) ([RU](https://d2718281828nis.github.io/ML-Reservoir_Computing/ru/)) | feed-forward network vs echo state network and NG-RC, trained in the browser; link to control theory | § 2.17, § 3.12 of the 2.3.5 version; not part of the 2.3.1 text | EN · RU |
| Catalog: [ai-is-out-there.github.io/#library](https://ai-is-out-there.github.io/#library) | all labs, including those outside the dissertation | — | — |

The page itself opens with the four theses of the dissertation in its specialty 2.3.1 version (section 1): detection
without labels by EVT, criteria for choosing the feature space, a graph architecture of transparent AI, and multi-agent
decision support with verifiable sources; the labs show Theses 1–2. Criterion 3 of Thesis 2 follows the wording of
2026-11-04: DFA indices are informative when long-range correlations span a wide range of scales (EEG, s_max ≳ 300 samples)
and uninformative on records with a slow trend and measurement noise (C-MAPSS). Source localization (“where”) and the
identifiability theorem come from the 2.3.5 version (theorem 2.18.1 there); the 2.3.1 version does not defend them — they
are auxiliary (Theorem 7.1, § 7.5), and the synthetic example is a positive control for Theses 1–2. Then follow a short visual review of the
“when — where” task, the methods M1–M9 and the harness H0–H10 (section 2) and a worked synthetic example (section 3).

**One sensor, five nodes** (section 3 of the page): from a single observed series to the answer “when — where”.
A Hurst-coloured burst of duration *D* starts at one of nodes A–D and reaches every node along the fastest path of the
graph (delay τ and gain w per edge). Each node has its own rhythm (characteristic frequency); the sensor at E records
their sum — the additive input of the guide (periodic + stochastic + fractal). By Theorem 7.1 one channel cannot tell
the source (O = {E} leaves all 10 node pairs unresolved), so the harness runs in two stages: **1-D EVT** (H7, H0, H1)
decides that an extreme event happened; a **structural analysis** of the background finds the nodes (spectral peaks
named through the object dictionary), the edges (structural graph) and an **n-D series** (Morlet envelopes, one per
node), after which the identifiability gate is re-checked; the **n-D path of Graph-EVT-agent** (`detect`,
`build_baseline_graph`, `rank_source`, ported from the guide) answers when and where, next to an arrival-time estimate
(statement 7.1). The page compares this with the 3σ rule on the raw series and per channel, verifies it by Monte Carlo
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

Repository R5, type **Direct**, in both versions of the dissertation.

| | Specialty 2.3.1 | Specialty 2.3.5 |
|---|---|---|
| Supports | Thesis 1 (rows 1.10 false alarms on event-free series, 1.11 robustness to the specification) and Thesis 2 (row 2.10 features matter more than the graph); positive control | artifact No. 5 — interactive labs; item 7 of the specialty passport (human–machine interfaces, computer graphics, visualization) |
| Where | § 3.7, Fig. 8 “One sensor, five nodes”; practical significance | § 7.1.2, Fig. 38; practical significance |
| Code | `js/onedim-core.js`, `js/onedim.js`; numbers from `tests/experiments.js` → `results/onedim_summary.json` | same |

The page is also the basis for an act of implementation in the educational process.

### Checking the quoted numbers

Every number the dissertation quotes from this page is recomputed in Node by the same functions the page calls
(`mcJobs`, `mcAdd`, `specGrid` in `js/onedim-core.js`) and checked in CI (`.github/workflows/port-check.yml`):

```bash
node tests/port_check.js           # JS graph methods = Graph-EVT-agent build_graph (Python) on a fixed input
node tests/experiments.js --check  # Monte Carlo 20 seeds × 4 sources + spec grid → results/onedim_summary.json
```

| Number in the dissertation | Key in `results/onedim_summary.json` | Expected (`tests/fixtures/onedim_expected.json`) |
|---|---|---|
| true source with structural / functional / empty graph (row 2.10) | `methods.chain_*_graph.top1` | 77 / 77 / 78 of 80 |
| alarms in event-free series: method vs 3σ rule (row 1.10) | `event_free_series_with_alarm` | 0 vs 16 of 20 |
| right answer across (q, γ, r) specifications (row 1.11) | `spec_grid` | 8 of 8 |

The surrogate test of the graph methods is left out of the port check on purpose: the page's `mulberry32` and numpy's
generator differ. `tests/make_graph_reference.py` regenerates the Python reference from a local Graph-EVT-agent.

### Related repositories

| Repository | Commit | Role |
|---|---|---|
| [Graph-EVT-agent](https://github.com/D2718281828nis/Graph-EVT-agent) | `244474c` | library: EVT detection (“when”), graph building and source ranking (“where”); the page ports its `detect`, `build_baseline_graph`, `rank_source` and graph methods |
| [EVT-educational-demo](https://github.com/D2718281828nis/EVT-educational-demo) | `2cc7071` | synthetic benchmarks with a known moment and source; hosts the guide and the Kuramoto explorer |
| [Extreme-Value-Theory-New-Approach](https://github.com/D2718281828nis/Extreme-Value-Theory-New-Approach) | `b57440f` | code and reference results of the three examples of chapter 7 (synced with the dissertation core on 2026-11-02) |
| [ML-Reservoir_Computing](https://github.com/D2718281828nis/ML-Reservoir_Computing) | — | echo state network of § 2.17 (2.3.5 version); hosts the reservoir explainer |

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
tests/fixtures/               Python reference of the graph methods; numbers the dissertation quotes (onedim_expected.json)
results/onedim_summary.json   output of tests/experiments.js
js/onedim.js      section 3: charts and controls
.github/workflows/pages.yml       deploys the site to GitHub Pages (manual run can publish another branch; writes version.json)
.github/workflows/port-check.yml  runs port_check.js and experiments.js --check
```

Run locally: `python3 -m http.server` in the repository root, then open http://localhost:8000/.

All data are synthetic. The labs illustrate the method and are not intended for engineering, financial or clinical decisions.

---

## Русский

Двуязычная (RU/EN) витрина браузерных лабораторий, сопровождающих диссертацию
**«Методы и средства исследования экстремальных событий сложных систем на основе графовых нейронных сетей»**
(Андриков Денис Анатольевич).

Лаборатории показывают метод **«когда — где»** на синтетических данных: теория экстремальных значений (POT/GPD)
оценивает, *когда* наблюдение стало экстремальным, граф зависимостей служит проверяемой гипотезой о путях
распространения события, а графовая модель ранжирует узлы по вероятности быть тем местом, *где* оно началось.
Всё работает в браузере без установки.

### Лаборатории

| Лаборатория | Что можно сделать | В диссертации | Язык |
|---|---|---|---|
| [Graph-EVT: руководство](https://d2718281828nis.github.io/EVT-educational-demo/index?lang=ru) | аддитивный сигнал по Хёрсту, 1-D и n-D, тревога POT/GPD, ранжирование источника, GNN и GAT, конвейер агента | § 2.9, § 3.7, § 7.1; Положение 1 | RU · EN |
| [Обозреватель Курамото](https://d2718281828nis.github.io/EVT-educational-demo/kuramoto/) | 12 связанных осцилляторов Курамото и распространение всплеска из `channel_00` | § 2.9, § 3.7 (рис. 6–7); положительный контроль | EN |
| [Резервуарные вычисления](https://d2718281828nis.github.io/ML-Reservoir_Computing/ru/) | сеть прямого распространения против сети эхо-состояний и NG-RC, обучение в браузере; связь с ТАУ | § 2.17, § 3.12 версии 2.3.5; в текст 2.3.1 не входит | RU · EN |
| Каталог: [ai-is-out-there.github.io/#library](https://ai-is-out-there.github.io/#library) | все лаборатории, включая не относящиеся к диссертации | — | — |

Страница начинается с четырёх Положений диссертации в версии по специальности 2.3.1 (раздел 1): выявление без
разметки на основе ТЭЗ, критерии выбора признакового пространства, графовая архитектура прозрачного ИИ и мультиагентная
поддержка решений с проверяемыми источниками; лаборатории показывают Положения 1–2. Критерий 3 Положения 2 дан в
редакции 04.11.2026: показатели DFA информативны, когда долгие корреляции охватывают широкий диапазон масштабов (ЭЭГ,
s_max ≳ 300 отсчётов), и неинформативны на записях с медленным трендом и шумом измерений (C-MAPSS). Локализация источника
(«где») и теорема идентифицируемости взяты из версии 2.3.5 (там теорема 2.18.1); в версии 2.3.1 они на защиту не выносятся —
это вспомогательные результаты (теорема 7.1, § 7.5), а синтетический пример служит положительным контролем Положений 1–2. Далее — короткий наглядный
обзор задачи «когда — где», методов М1–М9 и средств H0–H10 (раздел 2) и разобранный синтетический пример (раздел 3).

**Один датчик, пять узлов** (раздел 3 страницы): от одного наблюдаемого ряда к ответу «когда — где». Всплеск по Хёрсту
длительностью *D* зарождается в одном из узлов A–D и приходит в каждый узел по самому быстрому пути графа (на ребре
задержка τ и коэффициент w). У каждого узла свой ритм (характерная частота); датчик в E записывает их сумму — аддитивный
вход руководства (периодика + стохастика + фрактал). По теореме 7.1 один канал не различает источник (при O = {E} не
разрешена ни одна из 10 пар узлов), поэтому конвейер работает в два этапа: **одномерная EVT** (H7, H0, H1) устанавливает,
что произошло экстремальное событие; **структурный анализ** фона находит узлы (спектральные пики, названные по словарю
объекта), рёбра (структурный граф) и **многомерный ряд** (огибающие Морле, по одной на узел), после чего ворота
идентифицируемости проверяются заново; **n-D-ветвь Graph-EVT-agent** (`detect`, `build_baseline_graph`, `rank_source`,
перенесены из руководства) отвечает, когда и где, рядом с оценкой по временам прихода (утверждение 7.1). Страница
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

Репозиторий R5, тип **прямой**, в обеих версиях диссертации.

| | Специальность 2.3.1 | Специальность 2.3.5 |
|---|---|---|
| Что подтверждает | Положение 1 (строки 1.10 — ложные тревоги на рядах без события, 1.11 — устойчивость к спецификации) и Положение 2 (строка 2.10 — признаки важнее графа); положительный контроль | артефакт № 5 — интерактивные лаборатории; п. 7 паспорта специальности (человеко-машинные интерфейсы, компьютерная графика, визуализация) |
| Где | § 3.7, рис. 8 «Один датчик, пять узлов»; практическая значимость | § 7.1.2, рис. 38; практическая значимость |
| Код | `js/onedim-core.js`, `js/onedim.js`; числа — `tests/experiments.js` → `results/onedim_summary.json` | то же |

Страница также служит основанием для акта внедрения в учебный процесс.

### Проверка приведённых чисел

Каждое число, которое диссертация берёт с этой страницы, пересчитывается в Node теми же функциями, что вызывает
страница (`mcJobs`, `mcAdd`, `specGrid` в `js/onedim-core.js`), и сверяется в CI (`.github/workflows/port-check.yml`):

```bash
node tests/port_check.js           # графовые методы JS = build_graph Graph-EVT-agent (Python) на фиксированном входе
node tests/experiments.js --check  # Монте-Карло 20 затравок × 4 источника + сетка спецификаций → results/onedim_summary.json
```

| Число в диссертации | Ключ в `results/onedim_summary.json` | Ожидается (`tests/fixtures/onedim_expected.json`) |
|---|---|---|
| верный источник при структурном / функциональном / пустом графе (строка 2.10) | `methods.chain_*_graph.top1` | 77 / 77 / 78 из 80 |
| тревоги в рядах без события: метод против правила 3σ (строка 1.10) | `event_free_series_with_alarm` | 0 против 16 из 20 |
| верный ответ при спецификациях (q, γ, r) (строка 1.11) | `spec_grid` | 8 из 8 |

Суррогатный тест графовых методов в проверку переноса не входит намеренно: генератор страницы `mulberry32` и генератор
numpy различаются. `tests/make_graph_reference.py` заново строит эталон Python по локальной копии Graph-EVT-agent.

### Связанные репозитории

| Репозиторий | Коммит | Роль |
|---|---|---|
| [Graph-EVT-agent](https://github.com/D2718281828nis/Graph-EVT-agent) | `244474c` | библиотека: детекция по ТЭЗ («когда»), построение графа и ранжирование источника («где»); страница переносит её `detect`, `build_baseline_graph`, `rank_source` и графовые методы |
| [EVT-educational-demo](https://github.com/D2718281828nis/EVT-educational-demo) | `2cc7071` | синтетические эталоны с известными моментом и источником; на нём размещены руководство и обозреватель Курамото |
| [Extreme-Value-Theory-New-Approach](https://github.com/D2718281828nis/Extreme-Value-Theory-New-Approach) | `b57440f` | код и эталонные результаты трёх примеров главы 7 (сверены с ядром диссертации 02.11.2026) |
| [ML-Reservoir_Computing](https://github.com/D2718281828nis/ML-Reservoir_Computing) | — | эхо-сеть § 2.17 (версия 2.3.5); на нём размещён разбор резервуарных вычислений |

### Состав репозитория

```
index.html        двуязычная страница (переключатель EN/RU, ?lang=en|ru)
ru/index.html     русская точка входа → ../?lang=ru
css/site.css      стили, светлая и тёмная темы
js/site.js        переключатели языка и темы, миниатюра карточки Курамото
js/onedim-core.js вычисления раздела 3 (генератор, 1-D EVT, структурный анализ, перенос n-D Graph-EVT-agent); работает и в Node
js/onedim.js      раздел 3: графики и элементы управления
tests/port_check.js           сверка графовых методов JS с Graph-EVT-agent (Python)
tests/make_graph_reference.py заново строит tests/fixtures/graph_methods_reference.json по Graph-EVT-agent
tests/experiments.js          Монте-Карло и сетка спецификаций страницы → results/onedim_summary.json
tests/fixtures/               эталон графовых методов Python; числа, которые приводит диссертация (onedim_expected.json)
.github/workflows/pages.yml       публикация на GitHub Pages (ручной запуск может опубликовать другую ветку; пишет version.json)
.github/workflows/port-check.yml  запуск port_check.js и experiments.js --check
```

Локальный запуск: `python3 -m http.server` в корне репозитория, затем откройте http://localhost:8000/.

Все данные синтетические. Лаборатории иллюстрируют метод и не предназначены для инженерных, финансовых или клинических решений.

---

MIT License · © 2026 Denis A. Andrikov · ORCID [0000-0003-0359-0897](https://orcid.org/0000-0003-0359-0897)
