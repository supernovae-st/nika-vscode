# Algorithms · research-grounded registry

> Every non-trivial algorithm in this extension, its canonical citation,
> and what the 2023-2026 literature says about the choice. arXiv IDs
> hard-verified against the export API (2026-06-12 · two sweeps · 29 + 48
> papers screened, zero unverified IDs). Rule: an algorithm lands here
> WITH its paper, or it doesn't land.

## Implemented · language intelligence

### Shape propagation (typed dataflow) · `core/schemaShape.ts`

A task's declared `schema:` types every `${{ tasks.x.output.<path> }}`
downstream: typed completions, hover shapes, pre-oracle invalid-path
flags. This is the JSON-Schema-as-type-system move:

- arXiv:1911.12651 · *Type Safety with JSON Subschema* (2019) · decidable
  subschema checking for practical JSON Schema; originally built to catch
  data-compatibility bugs BETWEEN pipeline stages. Our per-edge case is
  the degenerate-but-dominant one (path-into-producer-schema); the full
  `producer ⊑ consumer` subschema check becomes relevant the day the
  language grows declared task INPUT schemas.
- arXiv:2202.12849 · *Witness Generation for JSON Schema* (2022) · next
  step: counterexample-bearing diagnostics (« this edge can carry a value
  the consumer rejects · here it is »).
- Oracle-agreement is contract-tested: client verdict == engine
  `schema_findings` on valid AND invalid paths against the real binary.
- Companion lint `nika.unused-schema` (diagnostics 1ter): a non-sink task
  declaring a schema nothing consumes is a broken promise · wire it or
  drop it. Additive over the oracle, conservative (sinks exempt).

### Transitive reduction · RETIRED with the gate algebra v2 (W2)

- Aho, Garey & Ullman · *The Transitive Reduction of a Directed Graph* ·
  SIAM J. Comput. 1(2), 1972 · powered the pre-W2 « redundant
  depends_on » hint. Under graph_format 2 every edge carries a
  PASS-SET (value admits {success, skipped} · `after: succeeded` admits
  {success} · …) and admission composes per edge, so an edge that is
  redundant for REACHABILITY is not redundant for ADMISSION: removing
  it can change what runs. The client hint and its quick fix left with
  the math's premise; the one narrow class that survives (a
  non-tightening `after:` restated beside a value edge) is the
  reference linter's `one-obvious-way/010` · the engine's voice.
- (The « ghost edge » half of the same pre-W2 pair died with
  NIKA-DAG-003 itself: in W2 the binding IS the edge, so a data ref
  without ordering is inexpressible · `NIKA-VAR-021` refuses the
  out-of-boundary ref at parse.)

### Bounded Damerau-Levenshtein did-you-mean · `core/graphIntel.ts`

Damerau 1964 · Levenshtein 1966. OSA variant, band ≤2 with early exit ·
same UX contract as the engine's tool suggestions, applied to task refs
where the report carries no suggestion field.

### Checker-feedback repair loop · fix grammar · `source.fixAll.nika` · the authoring prompt

The engine's ONE machine-applicable fix form (`add "X" to
permits.<path>`) + our one-click appliers + Fix All:

- arXiv:2308.05177 · *Fixing Rust Compilation Errors using LLMs* /
  RustAssistant (2023) · structured diagnostics in, **machine-applicable
  localized edit list out**, applied deterministically, loop with the
  compiler: ~74% peak fix rate; ablations show the changelog FORMAT
  itself matters. **Direct validation of the fix-grammar design.**
- arXiv:2304.05128 · *Self-Debug* (2023) · oracle-precision drives
  repair value; gains concentrate in rounds 1-3.
- arXiv:2306.09896 · *Is Self-Repair a Silver Bullet?* (2023) · at
  matched budget, self-repair often loses to parallel resampling unless
  feedback comes from a real oracle. Ours is one.
- arXiv:2510.13575 · industrial compiler-only auto-repair (2025) ·
  plateau after the first rounds; **2, max 3 rounds is the frontier**.
- arXiv:2310.01798 · *LLMs Cannot Self-Correct Reasoning Yet* (2023) ·
  never run a fix round without the checker's verdict in the prompt.

→ encoded in `core/aiPrompt.ts` AND executed by `core/generatePipeline.ts`
(below); reasoning free-form FIRST, constrained emission LAST
(arXiv:2408.02442 · *Let Me Speak Freely?* · strict format constraints
degrade reasoning; separate the phases).

## Implemented · the DAG engineering space · `core/dagAnalysis.ts`

Surfaced in the DAG panel: the card's fact block (« blast: blocks N » · pinch
marker) + the explainer's *engineering read* (width · speedup ceiling ·
k-worker wall-clock).

### Exact max parallelism · Dilworth via matching

- Dilworth · *A Decomposition Theorem for Partially Ordered Sets* ·
  Annals of Mathematics 51(1), 1950 · max antichain = min chain cover.
- Fulkerson · *Note on Dilworth's decomposition theorem* · Proc. AMS
  7(4), 1956 · min chain cover = n − max bipartite matching on the
  closure.
- Hopcroft & Karp · SIAM J. Comput. 2(4), 1973 · the O(E√V) matching.
  The witness antichain falls out of König's vertex-cover construction.
- 2023-26 sweep: the new almost-linear min-chain-cover line
  (arXiv:2305.02166 · arXiv:2211.09659 · arXiv:2308.08960) needs
  min-cost-flow machinery and pays off at n≥10⁵ (pangenomics) · at our
  n≤300, matching-on-closure is sub-millisecond. **Classic stands.**
- Term trap (for future searches): literature « DAG-width » is the
  cops-and-robbers measure (PSPACE-complete · arXiv:1411.2438), NOT
  poset width. Search « minimum chain cover / maximum antichain ».

### Pinch points · and why NOT dominators

A pinch point is a task comparable to every other task: the DAG narrows
to width 1 there · *nothing else can run while it runs*. Computed from
the closure (|ancestors| + |descendants| = n−1).

We evaluated dominator analysis (Cooper, Harvey & Kennedy · *A Simple,
Fast Dominance Algorithm* · Rice TR-06-33870, 2006 · the right choice
under ~30k nodes over Lengauer-Tarjan TOPLAS 1979) and **rejected it**:
dominators answer « which node is unavoidable to REACH the sink » ·
meaningful in control-flow graphs where paths are alternatives. In an
AND-join workflow DAG every task executes, so unavoidability is trivial
and the serialization question is the ANTICHAIN structure, not path
membership. (Worked counterexample: `a→v→b` plus `a→b` · `v` is not a
sink-dominator, yet nothing can overlap it.)

### Blast radius · failure semantics, not graph theory

AND-join semantics make this exact and cheap: a failed task blocks
EVERY descendant (each waits on all its dependencies), so blast radius
= |descendants|. No 2023-26 paper needed · the semantics is the proof.

### Work-span + k-worker wall-clock · Brent · Graham · HEFT lineage

- Brent · *The Parallel Evaluation of General Arithmetic Expressions* ·
  J. ACM 21(2), 1974 · speedup ceiling = work/span, however many workers.
- Graham · *Bounds for Certain Multiprocessing Anomalies* · BSTJ 45(9),
  1966 + *Bounds on Multiprocessing Timing Anomalies* · SIAM J. Appl.
  Math. 17(2), 1969 · ANY list schedule is within 2−1/k of optimal. The
  bracket `max(W/k, S) ≤ T_k ≤ W/k + S(k−1)/k` is property-tested.
- Topcuoglu, Hariri & Wu · *Performance-Effective and Low-Complexity
  Task Scheduling for Heterogeneous Computing* · IEEE TPDS 13(3), 2002 ·
  HEFT. With homogeneous workers it degenerates to list scheduling with
  **upward-rank priority**, which is exactly what we run; the
  heterogeneity machinery would be dead weight here.
- Weights: measured durations when EVERY node carries one (replayed/live
  run · the explainer recomputes at open), else unit weights. Never mix
  real milliseconds with synthetic 1s.
- 2025-26 LLM-pipeline schedulers (LLMSched arXiv:2504.03444 · Parrot
  2405.19888 · Teola 2407.00326 · Autellix 2502.13965 · the 2026 wave
  HexAGenT/FATE/SCALE/SAGA) are all cluster-serving-side online
  schedulers · wrong layer for an editor. **Steal one insight when
  multi-run telemetry exists**: per-task duration QUANTILES (p50/p90)
  → run the same list schedule per quantile → report a makespan
  interval instead of a point (no closed form exists for heavy tails).
- Coffman-Graham layering (Acta Informatica 1972): skipped · ELK owns
  layout; it's a layering heuristic, not parallelism math.

## Implemented · intent → workflow generation

### BM25 template/exemplar routing · `core/intentRank.ts`

- Robertson & Zaragoza · *The Probabilistic Relevance Framework: BM25
  and Beyond* · FnTIR 3(4), 2009 (doi:10.1561/1500000019).
- Why not embeddings at a ~30-doc corpus: BEIR (arXiv:2104.08663) ·
  dense fails out-of-domain without in-domain training; CodeRAG-Bench
  (arXiv:2406.14497) · lexical competitive on code/docs;
  arXiv:2604.01733 · BM25 beats text-embedding-3-large as first-stage on
  structured content. **No 2023-26 paper shows a dense win under 100
  docs.** The evidenced cheap upgrade is a curated query-side alias
  table (everyday words → Nika vocabulary), which we ship.

### The generation loop · `core/generatePipeline.ts` + `features/generate.ts`

Grounding (the Prompt2DAG hybrid recipe · arXiv:2509.13487: template +
LLM fill hit 78.5% executable vs 29.2% direct, 260 runs × 13 LLMs):

- 1 BM25-routed template + ≤2 retrieved exemplars (count per
  arXiv:2410.03981 · gains concentrate 0→1-3 shots; arXiv:2202.12837 ·
  demonstrations teach FORMAT) + a spec-slice from `nika schema`
  (grammar prompting · arXiv:2305.19234).
- Parallel-shaped intents ALWAYS see a fan-out exemplar: WorfBench
  (arXiv:2410.07869) · graph-structured generation is where LLMs fail
  hardest, and Nika data refs don't imply ordering.

Selection (best-of-N with a deterministic oracle · the literature's
best case):

- N parallel candidates, structurally deduped before scoring (AlphaCode
  arXiv:2203.07814 · behavioral clustering), scored by `nika check`
  (CodeT arXiv:2207.10397 lineage). Verifier-based selection beats
  majority voting on structured outputs (S* arXiv:2502.14382 ·
  arXiv:2502.01839); best-of-N gains exist ONLY with automatic
  verification (Monkeys arXiv:2407.21787). Early-stop on the first
  all-green candidate (compute-optimal · arXiv:2408.03314).
- Tie-break among all-green: hint count (soft signals), then cost.

Repair (≤2 rounds · best-so-far · never blind):

- The fresh report JSON rides every repair prompt (2310.01798); rounds
  capped at 2 (2306.09896 · 2510.13575); each round re-retrieves an
  exemplar matched to the FAILING codes' canon prose (RepoCoder
  arXiv:2303.12570); a regressed repair never replaces the best draft.

Rungs: with `vscode.lm` the loop runs natively; without it (Cursor
strips the API) the grounded prompt ships to the clipboard and the
routed template opens · the user's chat becomes the llm seam, the
protocol still converges. Not applicable client-side: WorkflowLLM
fine-tuning (arXiv:2411.05451) · AFlow MCTS (arXiv:2410.10762 · pays
only for open-ended search spaces with sparse reward, overkill for
fixed-schema single-file generation) · GPTSwarm graph optimization
(arXiv:2402.16823).

### The explain fallback · canon projection (`schemaIntel.parseCanonErrorCodes`)

Not research · a one-voice repair: `nika explain` knows the numeric
registry; the SPEC conformance codes (`NIKA-DAG-005` …) answer exit 2
(typed signal, never string-sniffed). The canon's `error_codes` table is
the projection source; engine-side unification is filed as the upstream
fix.

## The generator path (when we control the decoder)

- Chat-API today: provider structured-outputs cover only a JSON-Schema
  subset (arXiv:2501.10868 · JSONSchemaBench) · the conformance checker
  closes the gap in ≤2 repair rounds.
- Self-hosted later: arXiv:2411.15100 · **XGrammar** (byte-level PDA ·
  shipped in vLLM/SGLang) is the production default; arXiv:2403.01632 ·
  SynCode for custom-CFG paths; arXiv:2405.21047 · *Grammar-Aligned
  Decoding* warns greedy masking distorts the distribution · constrain
  minimally and late.
- **Never grammar-constrain block YAML directly** (indentation ⇒ not
  context-free): constrain JSON against the schema, transcode JSON→YAML
  deterministically.

## Next (trigger-gated · in value order per the surveys)

1. **Witness-bearing edge diagnostics** (2202.12849) · when the language
   grows consumer-side schemas.
2. **Makespan intervals from duration quantiles** · when multi-run
   telemetry exists: p50/p90 per task → list-schedule per quantile
   (LLMSched's uncertainty insight, client-side flavor).
3. **Error-recovering LR for the Rust LSP** (arXiv:1804.07133 · CPCT+ ·
   grmtools) · nothing since 2018 obsoletes it. Client-side full-document
   reparse stays right at our file sizes.
4. **Completion ranking** stays schema-derived + frequency
   (arXiv:2402.16197: offline benchmarks correlate poorly with in-editor
   acceptance; learned rankers need telemetry we don't have).
