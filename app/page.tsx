"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Binary, BookOpen, ChevronLeft, ChevronRight, CircleHelp, Cpu, Gauge, Pause, Play, RotateCcw, SkipForward, Undo2, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { CpuState, GUIDE_STEPS, LESSONS, createCpuState, formatBits, formatHex, parseByte, restoreSnapshot, stepCpu, updateProgram } from "@/lib/cpu";

type DetailKey = "PC" | "IR" | "Registers" | "ALU" | "Decoder" | "Memory" | "Clock" | "RealCPU" | "HALT";

const DETAILS: Record<DetailKey, { title: string; lead: string; body: string }> = {
  PC: { title: "PC（Program Counter）", lead: "いま、どの命令を実行するかを管理します。", body: "このアプリでは、分かりやすく「実行する命令の場所」として表示しています。実際のCPUでは命令取得の仕組みやPCの更新タイミングが異なる場合があります。" },
  IR: { title: "IR（Instruction Register）", lead: "いまCPUが処理している命令を表示します。", body: "学習しやすいよう、取得した命令を1つのIRとして見せています。実際のCPU内部はもっと複雑で、CPUによって構造も異なります。" },
  Registers: { title: "Registers（レジスタ）", lead: "CPUの中で値を一時的に持っておく場所です。", body: "メモリより少数で、計算に使う値や結果をすぐ渡せます。この学習用CPUにはR0〜R3の4個だけがあります。" },
  ALU: { title: "ALU（演算回路）", lead: "足し算、引き算、比較をする回路です。", body: "ADDなら加算、SUBなら減算、CMPなら比較を行います。命令のビットに応じて、どの動きをするかが決まります。" },
  Decoder: { title: "Decoder（命令デコーダ）", lead: "命令を見て、どの回路を動かすか決める部分です。", body: "CPUが言葉の意味を考えているのではありません。opcodeのビットの組み合わせによって、レジスタを読む・ALUを動かす・結果を書く、といった制御信号が出ます。" },
  Memory: { title: "Memory（メモリ）", lead: "命令やデータが置かれている場所です。", body: "この画面では見やすさのため、プログラムとデータを分けて表示しています。LOADでCPUへ取り出し、STOREでCPUから書き戻します。" },
  Clock: { title: "クロックとは？", lead: "CPUの回路が状態を更新するタイミングの基準です。", body: "このアプリのCycleは、小さな動きを追うための学習用カウンターです。実際のCPUで「1クロック＝1命令」とは限りません。" },
  RealCPU: { title: "実際のCPUはもっと複雑？", lead: "はい。ここでは、1つずつ動くシンプルなCPUとして表しています。", body: "実際にはキャッシュ、パイプライン、分岐予測、命令の並べ替え、複数コアなどがあります。まず基本の流れをつかむため、このアプリでは扱いません。" },
  HALT: { title: "HALTについて", lead: "この学習用プログラムを止める命令です。", body: "普通のPCでは、1つのアプリが終了してもOSやほかのプログラムが動いています。PC全体が止まるという意味ではありません。" },
};

const phaseLabel: Record<CpuState["phase"], string> = {
  locate: "命令を探す", fetch: "命令を取り出す", decode: "命令を見る", read: "データを読む", execute: "回路を動かす", writeback: "結果を保存", advance: "次の命令へ", halted: "停止", fault: "エラー",
};

function compactState(cpu: CpuState) {
  return {
    pc: formatHex(cpu.pc), ir: cpu.ir?.source ?? null,
    registers: Object.fromEntries(cpu.registers.map((value, index) => [`R${index}`, value])),
    memory: Object.fromEntries(Object.entries(cpu.memory).map(([address, value]) => [formatHex(Number(address)), value])),
    equal: cpu.equalFlag, phase: cpu.phase, status: cpu.status, cycle: cpu.cycle, message: cpu.message,
  };
}

function bitMeaning(cpu: CpuState) {
  const instruction = cpu.ir;
  if (!instruction?.bits || instruction.bits.length !== 16) return [];
  const bits = instruction.bits;
  if (!instruction.valid) return [{ bits: bits.slice(0, 4), label: "未定義のopcode" }];
  const items = [{ bits: bits.slice(0, 4), label: `${instruction.op}を選ぶ` }];
  if (["ADD", "SUB"].includes(instruction.op)) {
    items.push({ bits: bits.slice(4, 7), label: `R${instruction.args[0]}へ書く` }, { bits: bits.slice(7, 10), label: `R${instruction.args[1]}を読む` }, { bits: bits.slice(10, 13), label: `R${instruction.args[2]}を読む` });
  } else if (["LOAD", "LOADI", "STORE", "CMP"].includes(instruction.op)) {
    items.push({ bits: bits.slice(4, 7), label: `R${instruction.args[0]}を選ぶ` }, { bits: bits.slice(7, 15), label: `${instruction.args[1]}を表す` });
  } else if (["JMP", "JE", "JNE"].includes(instruction.op)) {
    items.push({ bits: bits.slice(4, 12), label: `${formatHex(instruction.args[0])}へ` });
  }
  return items;
}

function assemblyText(instruction: CpuState["program"]["instructions"][number]) {
  const [a = 0, b = 0, c = 0] = instruction.args;
  if (!instruction.valid || instruction.op === "INVALID") return instruction.source;
  if (["ADD", "SUB"].includes(instruction.op)) return `${instruction.op} R${a}, R${b}, R${c}`;
  if (["LOAD", "LOADI", "CMP"].includes(instruction.op)) return `${instruction.op} R${a}, ${instruction.op === "LOAD" ? formatHex(b) : b}`;
  if (instruction.op === "STORE") return `STORE ${formatHex(b)}, R${a}`;
  if (["JMP", "JE", "JNE"].includes(instruction.op)) return `${instruction.op} ${formatHex(a)}`;
  return "HALT";
}

function componentActive(cpu: CpuState, name: string) {
  const event = cpu.transfer;
  return event ? `${event.from} ${event.to}`.toLowerCase().includes(name.toLowerCase()) : false;
}

export default function Home() {
  const [lessonId, setLessonId] = useState(LESSONS[0].id);
  const lessonIdRef = useRef(lessonId);
  const lesson = useMemo(() => LESSONS.find((item) => item.id === lessonId) ?? LESSONS[0], [lessonId]);
  const [cpu, setCpu] = useState(() => createCpuState(LESSONS[0]));
  const cpuRef = useRef(cpu);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [binaryMode, setBinaryMode] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  const [detail, setDetail] = useState<DetailKey | null>(null);

  const commitState = useCallback((next: CpuState) => {
    cpuRef.current = next;
    setCpu(next);
    if (next.status !== "ready") setRunning(false);
    return next;
  }, []);

  const performSteps = useCallback((count = 1) => {
    let next = cpuRef.current;
    for (let index = 0; index < count && next.status === "ready"; index += 1) next = stepCpu(next);
    return commitState(next);
  }, [commitState]);

  const loadLesson = useCallback((id: typeof LESSONS[number]["id"]) => {
    const nextLesson = LESSONS.find((item) => item.id === id) ?? LESSONS[0];
    setLessonId(nextLesson.id);
    setRunning(false);
    commitState(createCpuState(nextLesson));
  }, [commitState]);

  useEffect(() => { cpuRef.current = cpu; }, [cpu]);
  useEffect(() => { lessonIdRef.current = lessonId; }, [lessonId]);
  useEffect(() => {
    if (!running || cpu.status !== "ready") return;
    const timer = window.setInterval(() => performSteps(1), 1000 / speed);
    return () => window.clearInterval(timer);
  }, [running, speed, cpu.status, performSteps]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<typeof context.registerTool>[0]) => {
      try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined); } catch { /* optional API */ }
    };
    register({ name: "read_cpu_state", title: "CPUの状態を読む", description: "現在のPC、IR、レジスタ、メモリ、フラグ、Cycleを読みます。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => compactState(cpuRef.current) });
    register({ name: "load_cpu_lesson", title: "CPUレッスンを開く", description: "指定したプリセットを読み込み、CPUを初期状態に戻します。", inputSchema: { type: "object", properties: { lesson: { type: "string", enum: LESSONS.map((item) => item.id) } }, required: ["lesson"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: (input: unknown) => {
      const id = (input as { lesson?: string })?.lesson;
      const selected = LESSONS.find((item) => item.id === id);
      if (!selected) throw new Error("Unknown lesson.");
      setLessonId(selected.id); setRunning(false); return compactState(commitState(createCpuState(selected)));
    } });
    register({ name: "configure_cpu_state", title: "CPUの値を設定", description: "PC、R0〜R3、表示中のメモリをまとめて設定します。", inputSchema: { type: "object", properties: { pc: { type: "integer", minimum: 0, maximum: 252, multipleOf: 4 }, registers: { type: "array", minItems: 4, maxItems: 4, items: { type: "integer", minimum: 0, maximum: 255 } }, memory: { type: "object", additionalProperties: { type: "integer", minimum: 0, maximum: 255 } } }, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: (input: unknown) => {
      const values = input as { pc?: number; registers?: number[]; memory?: Record<string, number> };
      const previous = cpuRef.current;
      if (values.pc !== undefined && (!Number.isInteger(values.pc) || values.pc < 0 || values.pc > 252 || values.pc % 4)) throw new Error("PC must be an aligned byte address from 0 to 252.");
      if (values.registers && (values.registers.length !== 4 || values.registers.some((value) => !Number.isInteger(value) || value < 0 || value > 255))) throw new Error("registers must contain four bytes.");
      const memory = { ...previous.memory };
      for (const [addressText, value] of Object.entries(values.memory ?? {})) { const address = parseByte(addressText); if (address === null || !Number.isInteger(value) || value < 0 || value > 255) throw new Error("Memory addresses and values must be bytes."); memory[address] = value; }
      const next: CpuState = { ...previous, pc: values.pc ?? previous.pc, registers: values.registers ? [...values.registers] : previous.registers, memory, ir: null, phase: "locate", status: "ready", history: [], transfer: null, message: "CPUの値を更新しました。" };
      setRunning(false); return compactState(commitState(next));
    } });
    register({ name: "step_cpu", title: "CPUを進める", description: "CPUを指定した小ステップ数だけ進めます。", inputSchema: { type: "object", properties: { steps: { type: "integer", minimum: 1, maximum: 100 } }, required: ["steps"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: (input: unknown) => { const steps = (input as { steps?: number })?.steps; if (!Number.isInteger(steps) || (steps ?? 0) < 1 || (steps ?? 0) > 100) throw new Error("steps must be an integer from 1 to 100."); setRunning(false); return compactState(performSteps(steps)); } });
    register({ name: "reset_cpu", title: "CPUをリセット", description: "現在のレッスンを最初からやり直します。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => { const selected = LESSONS.find((item) => item.id === lessonIdRef.current) ?? LESSONS[0]; setRunning(false); return compactState(commitState(createCpuState(selected))); } });
    return () => lifecycle.abort();
  }, [commitState, performSteps]);

  const editState = (patch: Partial<CpuState>, message: string) => { setRunning(false); commitState({ ...cpuRef.current, ...patch, ir: null, phase: "locate", status: "ready", transfer: null, pendingResult: null, pendingTarget: null, branchTaken: false, history: [], message }); };
  const editNumber = (kind: "pc" | "register" | "memory", index: number, text: string) => {
    const value = parseByte(text); if (value === null || (kind === "pc" && value % 4 !== 0)) return;
    if (kind === "pc") editState({ pc: value }, `PCを${formatHex(value)}へ変更しました。`);
    if (kind === "register") { const registers = [...cpu.registers]; registers[index] = value; editState({ registers }, `R${index}を${value}へ変更しました。`); }
    if (kind === "memory") editState({ memory: { ...cpu.memory, [index]: value } }, `Memory[${formatHex(index)}]を${value}へ変更しました。`);
  };

  const currentLine = cpu.program.instructions.find((instruction) => instruction.address === cpu.pc)?.lineIndex;
  const meanings = bitMeaning(cpu);
  const isFault = cpu.status === "fault";

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-3 py-3 sm:px-5 lg:px-7">
        <header className="lab-header">
          <div className="flex min-w-0 items-center gap-3"><div className="logo-chip" aria-hidden="true"><Cpu /></div><div className="min-w-0"><p className="overline">TOUCH THE CYCLE</p><h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">CPU動作シミュレーター</h1></div></div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="sr-only" htmlFor="lesson">プリセット</label>
            <NativeSelect id="lesson" value={lessonId} onChange={(event) => loadLesson(event.target.value as typeof LESSONS[number]["id"])} className="lesson-select">{LESSONS.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.eyebrow} — {item.title}</NativeSelectOption>)}</NativeSelect>
            <button type="button" className="cycle-pill" onClick={() => setDetail("Clock")}><span className="clock-wave" aria-hidden="true">_|‾|_</span> Cycle {cpu.cycle}</button>
            <span className={`status-pill status-${cpu.status}`}>{cpu.status === "ready" ? phaseLabel[cpu.phase] : cpu.status === "halted" ? "HALTED" : "FAULT"}</span>
          </div>
        </header>

        <section className="lesson-strip" aria-label="現在のレッスン"><div><span>{lesson.eyebrow}</span><strong>{lesson.humanCode}</strong></div><p>{lesson.summary}</p>{lesson.id === "login" && <p className="login-note">実際のログインにはOS、ネットワーク、暗号処理、データベースも関係します。ここではCPUの基本に単純化しています。</p>}</section>

        <div className="workbench">
          <section className="panel program-panel" aria-labelledby="program-title">
            <div className="panel-heading"><div><span className="panel-index">01</span><h2 id="program-title">プログラム</h2></div><label className="binary-toggle"><Binary aria-hidden="true" /><span>中を見る：0と1</span><Switch checked={binaryMode} onCheckedChange={setBinaryMode} aria-label="機械語表示を切り替える" /></label></div>
            <div className="program-list" role="list">
              {cpu.programLines.map((source, lineIndex) => {
                const address = cpu.program.lineAddresses[lineIndex];
                const instruction = cpu.program.instructions.find((item) => item.lineIndex === lineIndex);
                const isLabel = address === null && source.trim().endsWith(":");
                const isBinarySource = /^[01\s]+$/.test(source.trim());
                const display = binaryMode && instruction ? (instruction.bits || source) : !binaryMode && instruction && isBinarySource ? assemblyText(instruction) : source;
                const error = cpu.program.diagnostics[lineIndex];
                return <div key={`${lineIndex}-${binaryMode}`} className={`program-row ${currentLine === lineIndex ? "is-current" : ""} ${error ? "is-invalid" : ""}`} role="listitem"><span className="address">{address === null ? "··" : formatHex(address)}</span><span className="pc-arrow" aria-hidden="true">{currentLine === lineIndex ? "▶" : ""}</span><input aria-label={`プログラム ${lineIndex + 1}行目`} aria-invalid={Boolean(error)} className={`instruction-input ${isLabel ? "label-input" : ""}`} value={display} onChange={(event) => { const lines = [...cpu.programLines]; lines[lineIndex] = event.target.value; setRunning(false); commitState(updateProgram(cpuRef.current, lines)); }} />{error && <span className="line-error">{error}</span>}</div>;
              })}
            </div>
            <p className="tiny-note">命令を書き換えて試せます。アドレスは4ずつ進みます。</p>
          </section>

          <section className="panel cpu-panel" aria-labelledby="cpu-title">
            <div className="panel-heading"><div><span className="panel-index">02</span><h2 id="cpu-title">CPU</h2></div><span className={`equal-flag ${cpu.equalFlag ? "is-on" : ""}`}>Equal {cpu.equalFlag ? "ON" : "OFF"}</span></div>
            <div className={`cpu-canvas transfer-${cpu.transfer?.kind ?? "none"}`}>
              <div className="cpu-topline">
                <div className={`component-card pc-card ${componentActive(cpu, "PC") ? "is-active" : ""}`}><button type="button" className="component-open" onClick={() => setDetail("PC")}><span>PC</span></button><input aria-label="PCの値" value={formatHex(cpu.pc)} onChange={(event) => editNumber("pc", 0, event.target.value)} /><small>次の命令</small></div>
                <div className="flow-arrow control-arrow" aria-hidden="true">→</div>
                <button type="button" onClick={() => setDetail("IR")} className={`component-card ir-card ${componentActive(cpu, "IR") ? "is-active" : ""}`}><span>IR</span><strong>{cpu.ir?.op ?? "—"}</strong><small>{cpu.ir ? formatBits(cpu.ir.bits) : "命令を待っています"}</small></button>
              </div>
              <div className="vertical-flow" aria-hidden="true">↓</div>
              <button type="button" onClick={() => setDetail("Decoder")} className={`decoder-card ${componentActive(cpu, "Decoder") ? "is-active" : ""}`}><span>DECODER</span><strong>{cpu.ir?.op === "INVALID" ? "?" : cpu.ir?.op ?? "待機"}</strong><small>どの回路を動かす？</small></button>
              {binaryMode && cpu.ir && <div className="bit-breakdown" aria-label="命令ビットの意味">{meanings.map((item) => <div key={`${item.bits}-${item.label}`}><code>{item.bits}</code><span>{item.label}</span></div>)}</div>}
              <div className="datapath">
                <div className={`register-bank ${componentActive(cpu, "R") ? "is-active" : ""}`}><button type="button" className="component-open" onClick={() => setDetail("Registers")}><span className="component-label">REGISTERS</span></button><div className="register-grid">{cpu.registers.map((value, index) => <label key={index}><span>R{index}</span><input aria-label={`R${index}の値`} value={value} onChange={(event) => editNumber("register", index, event.target.value)} /></label>)}</div></div>
                <div className="data-bus" aria-hidden="true"><span>→</span><span>→</span></div>
                <button type="button" onClick={() => setDetail("ALU")} className={`alu-card ${componentActive(cpu, "ALU") ? "is-active" : ""}`}><span>ALU</span><strong>{cpu.ir?.op === "ADD" ? "+" : cpu.ir?.op === "SUB" ? "−" : cpu.ir?.op === "CMP" ? "?=" : "·"}</strong><small>計算・比較</small></button>
              </div>
              {cpu.transfer && <div key={cpu.cycle} className={`transfer-readout kind-${cpu.transfer.kind}`} aria-live="polite"><span>{cpu.transfer.from}</span><i>→</i><strong>{cpu.transfer.value}</strong><i>→</i><span>{cpu.transfer.to}</span></div>}
            </div>
          </section>

          <section className="panel memory-panel" aria-labelledby="memory-title">
            <div className="panel-heading"><div><span className="panel-index">03</span><h2 id="memory-title">メモリ</h2></div><Button variant="ghost" size="icon-sm" onClick={() => setDetail("Memory")} aria-label="メモリの説明"><CircleHelp /></Button></div>
            <div className={`memory-stack ${componentActive(cpu, "Memory") ? "is-active" : ""}`}>{Object.entries(cpu.memory).sort(([a], [b]) => Number(a) - Number(b)).map(([address, value]) => <label key={address}><span>{formatHex(Number(address))}</span><input aria-label={`${formatHex(Number(address))}の値`} value={value} onChange={(event) => editNumber("memory", Number(address), event.target.value)} /></label>)}</div>
            <div className="memory-legend"><span><i className="legend-dot data" />読み出し</span><span><i className="legend-dot write" />書き込み</span></div>
            <button type="button" className="more-cpu" onClick={() => setDetail("RealCPU")}><CircleHelp />実際のCPUはもっと複雑？</button>
          </section>
        </div>

        <section className={`explain-panel ${isFault ? "is-fault" : ""}`} aria-labelledby="explain-title">
          <div className="explain-copy"><div className="explain-icon" aria-hidden="true">{isFault ? "!" : <Zap />}</div><div><p className="overline" id="explain-title">いま何が起きている？ — {phaseLabel[cpu.phase]}</p><p className="main-message">{cpu.message}</p></div></div>
          <div className="controls"><Button variant="outline" onClick={() => { setRunning(false); commitState(restoreSnapshot(cpuRef.current)); }} disabled={!cpu.history.length} aria-label="1つ前へ戻る"><Undo2 />戻る</Button><Button className="step-button" onClick={() => performSteps(1)} disabled={cpu.status !== "ready"}><SkipForward />Step</Button><Button variant="outline" onClick={() => setRunning((value) => !value)} disabled={cpu.status !== "ready"}>{running ? <Pause /> : <Play />}{running ? "Pause" : "Run"}</Button><Button variant="ghost" size="icon" onClick={() => loadLesson(lessonId)} aria-label="リセット"><RotateCcw /></Button><label className="speed-control"><Gauge aria-hidden="true" /><span className="sr-only">実行速度</span><Slider value={[speed]} onValueChange={(value) => setSpeed(value[0])} min={0.5} max={4} step={0.5} aria-label="実行速度" /><output>{speed}×</output></label>{cpu.status === "halted" && <button type="button" className="halt-help" onClick={() => setDetail("HALT")}>HALTとは？</button>}</div>
        </section>

        <section className="guide-panel" aria-labelledby="guide-title">
          <div className="guide-title"><BookOpen /><div><p className="overline">LEARNING PATH</p><h2 id="guide-title">触りながら進める</h2></div></div>
          <div className="guide-current"><span>{String(guideIndex + 1).padStart(2, "0")}</span><div><strong>{GUIDE_STEPS[guideIndex].title}</strong><p>{GUIDE_STEPS[guideIndex].detail}</p></div></div>
          <div className="guide-progress" aria-label={`全9ステップ中${guideIndex + 1}`}>{GUIDE_STEPS.map((step, index) => <button type="button" key={step.title} className={index === guideIndex ? "is-current" : index < guideIndex ? "is-done" : ""} aria-label={`${index + 1}. ${step.title}`} onClick={() => { setGuideIndex(index); loadLesson(step.lesson); if (index >= 7) setBinaryMode(true); if (index === 8) setDetail("Decoder"); }} />)}</div>
          <div className="guide-actions"><Button variant="ghost" size="sm" disabled={guideIndex === 0} onClick={() => { const previous = Math.max(0, guideIndex - 1); setGuideIndex(previous); loadLesson(GUIDE_STEPS[previous].lesson); if (previous < 7) setBinaryMode(false); }}><ChevronLeft />前へ</Button><Button variant="ghost" size="sm" disabled={guideIndex === GUIDE_STEPS.length - 1} onClick={() => { const next = Math.min(GUIDE_STEPS.length - 1, guideIndex + 1); setGuideIndex(next); loadLesson(GUIDE_STEPS[next].lesson); if (next >= 7) setBinaryMode(true); if (next === 8) setDetail("Decoder"); }}>次へ<ChevronRight /></Button></div>
        </section>
      </div>

      <Sheet open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}><SheetContent showCloseButton={false} className="detail-sheet border-slate-700 bg-[#0b1424] text-slate-100"><SheetClose className="sheet-close" aria-label="閉じる"><X /></SheetClose>{detail && <><SheetHeader className="pt-14"><p className="overline">CPU FIELD NOTE</p><SheetTitle className="text-2xl text-white">{DETAILS[detail].title}</SheetTitle><SheetDescription className="text-base leading-relaxed text-cyan-100">{DETAILS[detail].lead}</SheetDescription></SheetHeader><div className="px-4"><div className="detail-diagram"><span>{detail}</span><i /><strong>{detail === "Clock" ? "_|‾|_|‾|_" : "0101 · 001 · 00000101"}</strong></div><p className="mt-6 text-base leading-8 text-slate-300">{DETAILS[detail].body}</p>{detail === "Decoder" && <p className="truth-note">CPUが「足し算しよう」と考えるのではなく、ビットの組み合わせで回路が動きます。</p>}</div></>}</SheetContent></Sheet>
    </main>
  );
}

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool: (tool: { name: string; title?: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute: (input: unknown) => unknown | Promise<unknown> }, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}
