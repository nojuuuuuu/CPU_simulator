export type RegisterName = "R0" | "R1" | "R2" | "R3";
export type Opcode =
  | "LOAD"
  | "LOADI"
  | "ADD"
  | "SUB"
  | "STORE"
  | "CMP"
  | "JMP"
  | "JE"
  | "JNE"
  | "HALT"
  | "INVALID";

export type CpuPhase =
  | "locate"
  | "fetch"
  | "decode"
  | "read"
  | "execute"
  | "writeback"
  | "advance"
  | "halted"
  | "fault";

export type TransferKind = "control" | "data" | "write" | "fault";

export interface TransferEvent {
  from: string;
  to: string;
  value: string;
  kind: TransferKind;
}

export interface Instruction {
  address: number;
  lineIndex: number;
  source: string;
  op: Opcode;
  args: number[];
  bits: string;
  valid: boolean;
  error?: string;
}

export interface ParsedProgram {
  instructions: Instruction[];
  lineAddresses: Array<number | null>;
  labels: Record<string, number>;
  diagnostics: Record<number, string>;
}

export interface CpuSnapshot {
  pc: number;
  ir: Instruction | null;
  registers: number[];
  memory: Record<number, number>;
  equalFlag: boolean;
  phase: CpuPhase;
  status: "ready" | "halted" | "fault";
  cycle: number;
  message: string;
  transfer: TransferEvent | null;
  pendingResult: number | null;
  pendingTarget: number | null;
  branchTaken: boolean;
}

export interface CpuState extends CpuSnapshot {
  programLines: string[];
  program: ParsedProgram;
  history: CpuSnapshot[];
}

export interface Lesson {
  id: "sum" | "memory" | "if" | "loop" | "login";
  title: string;
  eyebrow: string;
  humanCode: string;
  summary: string;
  program: string[];
  registers?: number[];
  memory?: Record<number, number>;
}

const OPCODE_BITS: Record<Exclude<Opcode, "INVALID">, string> = {
  LOAD: "0001",
  LOADI: "0010",
  ADD: "0011",
  SUB: "0100",
  STORE: "0101",
  CMP: "0110",
  JMP: "0111",
  JE: "1000",
  JNE: "1001",
  HALT: "1110",
};

const BITS_OPCODE = Object.fromEntries(
  Object.entries(OPCODE_BITS).map(([op, bits]) => [bits, op]),
) as Record<string, Exclude<Opcode, "INVALID">>;

export const LESSONS: Lesson[] = [
  {
    id: "sum",
    title: "5 + 3",
    eyebrow: "まずは足し算",
    humanCode: "x = 5 + 3",
    summary: "値をレジスタへ入れ、ALUで足して、メモリへ保存します。",
    program: [
      "LOADI R1, 5",
      "LOADI R2, 3",
      "ADD R3, R1, R2",
      "STORE 0x80, R3",
      "HALT",
    ],
  },
  {
    id: "memory",
    title: "メモリ",
    eyebrow: "取り出す・置く",
    humanCode: "x = memory[0x80] + memory[0x84]",
    summary: "LOADはメモリから取り出し、STOREはメモリへ置きます。",
    program: [
      "LOAD R1, 0x80",
      "LOAD R2, 0x84",
      "ADD R3, R1, R2",
      "STORE 0x88, R3",
      "HALT",
    ],
    memory: { 0x80: 5, 0x84: 3, 0x88: 0, 0x8c: 0 },
  },
  {
    id: "if",
    title: "if",
    eyebrow: "比較とジャンプ",
    humanCode: "if (R1 == 5) { success }",
    summary: "ifは、比較した結果と条件付きジャンプの組み合わせです。",
    program: [
      "CMP R1, 5",
      "JNE failure",
      "LOADI R2, 1",
      "JMP end",
      "failure:",
      "LOADI R2, 0",
      "end:",
      "HALT",
    ],
    registers: [0, 5, 0, 0],
  },
  {
    id: "loop",
    title: "while",
    eyebrow: "前へ戻る",
    humanCode: "while (R1 != 5) { R1 = R1 + 1 }",
    summary: "PCが前の命令へ戻ることで、同じ処理を繰り返します。",
    program: [
      "LOADI R1, 0",
      "LOADI R2, 1",
      "loop:",
      "ADD R1, R1, R2",
      "CMP R1, 5",
      "JNE loop",
      "HALT",
    ],
  },
  {
    id: "login",
    title: "ログインまとめ",
    eyebrow: "身近な処理へ",
    humanCode: "入力 → 保存情報を読む → 比較 → 結果を分ける",
    summary: "実際のログインを単純化し、LOAD・CMP・JNEで表します。",
    program: [
      "LOAD R1, 0x80",
      "LOAD R2, 0x84",
      "SUB R0, R1, R2",
      "CMP R0, 0",
      "JNE failure",
      "LOADI R3, 1",
      "JMP end",
      "failure:",
      "LOADI R3, 0",
      "end:",
      "HALT",
    ],
    memory: { 0x80: 7, 0x84: 7, 0x88: 0, 0x8c: 0 },
  },
];

export const GUIDE_STEPS = [
  { title: "数字を入れる", detail: "LOADIでレジスタに値を入れる", lesson: "sum" },
  { title: "足す", detail: "R1とR2をALUへ送る", lesson: "sum" },
  { title: "メモリ", detail: "LOADとSTOREで値を動かす", lesson: "memory" },
  { title: "PCを見る", detail: "次の命令へ4ずつ進む", lesson: "sum" },
  { title: "比較する", detail: "CMPで同じか確かめる", lesson: "if" },
  { title: "ジャンプ", detail: "JE・JNEで進む先を変える", lesson: "if" },
  { title: "前へ戻る", detail: "ジャンプでループを作る", lesson: "loop" },
  { title: "0と1を見る", detail: "命令を16ビットで見る", lesson: "sum" },
  { title: "Decoder", detail: "ビットから動く回路を見る", lesson: "sum" },
] as const;

const toBits = (value: number, width: number) =>
  (value >>> 0).toString(2).padStart(width, "0").slice(-width);

const parseRegister = (value: string) => {
  const match = /^R([0-3])$/i.exec(value.trim());
  return match ? Number(match[1]) : null;
};

export const parseByte = (value: string | number) => {
  const number =
    typeof value === "number"
      ? value
      : /^0x[0-9a-f]+$/i.test(value.trim())
        ? Number.parseInt(value.trim().slice(2), 16)
        : /^\d+$/.test(value.trim())
          ? Number.parseInt(value.trim(), 10)
          : Number.NaN;
  return Number.isInteger(number) && number >= 0 && number <= 255 ? number : null;
};

const invalidInstruction = (
  address: number,
  lineIndex: number,
  source: string,
  error: string,
  bits = "",
): Instruction => ({
  address,
  lineIndex,
  source,
  op: "INVALID",
  args: [],
  bits,
  valid: false,
  error,
});

export function encodeInstruction(instruction: Instruction): string {
  if (!instruction.valid || instruction.op === "INVALID") return instruction.bits;
  const opcode = OPCODE_BITS[instruction.op];
  const [a = 0, b = 0, c = 0] = instruction.args;
  switch (instruction.op) {
    case "LOAD":
    case "LOADI":
    case "STORE":
    case "CMP":
      return `${opcode}${toBits(a, 3)}${toBits(b, 8)}0`;
    case "ADD":
    case "SUB":
      return `${opcode}${toBits(a, 3)}${toBits(b, 3)}${toBits(c, 3)}000`;
    case "JMP":
    case "JE":
    case "JNE":
      return `${opcode}${toBits(a, 8)}0000`;
    case "HALT":
      return `${opcode}000000000000`;
  }
}

export function decodeInstruction(
  rawBits: string,
  address = 0,
  lineIndex = 0,
): Instruction {
  const bits = rawBits.replace(/\s/g, "");
  if (!/^[01]{16}$/.test(bits)) {
    return invalidInstruction(address, lineIndex, rawBits, "16個の0と1で入力してください。", bits);
  }
  const op = BITS_OPCODE[bits.slice(0, 4)];
  if (!op) {
    return invalidInstruction(
      address,
      lineIndex,
      rawBits,
      "このビット列は、このCPUでは命令として定義されていません。",
      bits,
    );
  }
  const register = (start: number) => Number.parseInt(bits.slice(start, start + 3), 2);
  const addressByte = (start: number) => Number.parseInt(bits.slice(start, start + 8), 2);
  let args: number[] = [];
  let reserved = "";
  if (["LOAD", "LOADI", "STORE", "CMP"].includes(op)) {
    args = [register(4), addressByte(7)];
    reserved = bits.slice(15);
  } else if (["ADD", "SUB"].includes(op)) {
    args = [register(4), register(7), register(10)];
    reserved = bits.slice(13);
  } else if (["JMP", "JE", "JNE"].includes(op)) {
    args = [addressByte(4)];
    reserved = bits.slice(12);
  } else {
    reserved = bits.slice(4);
  }
  if (args.some((value, index) => index < (op === "CMP" ? 1 : (["LOAD", "LOADI", "STORE"].includes(op) ? 1 : (["ADD", "SUB"].includes(op) ? 3 : 0))) && value > 3)) {
    return invalidInstruction(address, lineIndex, rawBits, "R0〜R3以外のレジスタ番号です。", bits);
  }
  if (/1/.test(reserved)) {
    return invalidInstruction(address, lineIndex, rawBits, "予約ビットは0にしてください。", bits);
  }
  const instruction: Instruction = {
    address,
    lineIndex,
    source: rawBits,
    op,
    args,
    bits,
    valid: true,
  };
  return instruction;
}

function parseAssemblyInstruction(
  source: string,
  address: number,
  lineIndex: number,
  labels: Record<string, number>,
): Instruction {
  const clean = source.replace(/;.*/, "").trim();
  if (/^[01\s]+$/.test(clean)) return decodeInstruction(clean, address, lineIndex);
  const match = /^([A-Za-z]+)(?:\s+(.+))?$/.exec(clean);
  if (!match) return invalidInstruction(address, lineIndex, source, "命令の書き方を確認してください。");
  const op = match[1].toUpperCase() as Opcode;
  const operandText = match[2]?.trim() ?? "";
  const operands = operandText ? operandText.split(",").map((item) => item.trim()) : [];
  if (!(op in OPCODE_BITS)) {
    return invalidInstruction(address, lineIndex, source, `「${match[1]}」は定義されていない命令です。`);
  }

  let args: number[] = [];
  const bad = (message: string) => invalidInstruction(address, lineIndex, source, message);
  if (["ADD", "SUB"].includes(op)) {
    if (operands.length !== 3) return bad(`${op}には3つのレジスタが必要です。`);
    const registers = operands.map(parseRegister);
    if (registers.some((value) => value === null)) return bad("レジスタはR0〜R3で指定してください。");
    args = registers as number[];
  } else if (["LOAD", "LOADI", "STORE", "CMP"].includes(op)) {
    if (operands.length !== 2) return bad(`${op}には2つの値が必要です。`);
    const first = parseRegister(op === "STORE" ? operands[1] : operands[0]);
    const second = parseByte(op === "STORE" ? operands[0] : operands[1]);
    if (first === null) return bad("レジスタはR0〜R3で指定してください。");
    if (second === null) return bad("値は0〜255の10進数か0x形式で指定してください。");
    args = [first, second];
  } else if (["JMP", "JE", "JNE"].includes(op)) {
    if (operands.length !== 1) return bad(`${op}にはジャンプ先が必要です。`);
    const target = labels[operands[0]] ?? parseByte(operands[0]);
    if (target === null || target === undefined || target % 4 !== 0) {
      return bad("ジャンプ先はラベルか4の倍数のアドレスで指定してください。");
    }
    args = [target];
  } else if (op === "HALT") {
    if (operands.length) return bad("HALTに値は必要ありません。");
  }
  const instruction: Instruction = {
    address,
    lineIndex,
    source,
    op,
    args,
    bits: "",
    valid: true,
  };
  instruction.bits = encodeInstruction(instruction);
  return instruction;
}

export function parseProgram(lines: string[]): ParsedProgram {
  const labels: Record<string, number> = {};
  const lineAddresses: Array<number | null> = Array(lines.length).fill(null);
  let pc = 0;
  const bodies = lines.map((source, lineIndex) => {
    const withoutComment = source.replace(/;.*/, "").trim();
    if (!withoutComment) return "";
    const labelMatch = /^([A-Za-z_][\w]*):(?:\s*(.*))?$/.exec(withoutComment);
    if (labelMatch) {
      labels[labelMatch[1]] = pc;
      const body = labelMatch[2]?.trim() ?? "";
      if (!body) return "";
      lineAddresses[lineIndex] = pc;
      pc += 4;
      return body;
    }
    lineAddresses[lineIndex] = pc;
    pc += 4;
    return withoutComment;
  });

  const instructions: Instruction[] = [];
  const diagnostics: Record<number, string> = {};
  bodies.forEach((body, lineIndex) => {
    const address = lineAddresses[lineIndex];
    if (!body || address === null) return;
    const instruction = parseAssemblyInstruction(body, address, lineIndex, labels);
    instructions.push(instruction);
    if (!instruction.valid && instruction.error) diagnostics[lineIndex] = instruction.error;
  });
  return { instructions, lineAddresses, labels, diagnostics };
}

const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;
const reg = (index: number) => `R${index}`;

function snapshot(state: CpuState): CpuSnapshot {
  return {
    pc: state.pc,
    ir: state.ir ? { ...state.ir, args: [...state.ir.args] } : null,
    registers: [...state.registers],
    memory: { ...state.memory },
    equalFlag: state.equalFlag,
    phase: state.phase,
    status: state.status,
    cycle: state.cycle,
    message: state.message,
    transfer: state.transfer ? { ...state.transfer } : null,
    pendingResult: state.pendingResult,
    pendingTarget: state.pendingTarget,
    branchTaken: state.branchTaken,
  };
}

export function createCpuState(lesson: Lesson = LESSONS[0]): CpuState {
  const programLines = [...lesson.program];
  return {
    pc: 0,
    ir: null,
    registers: lesson.registers ? [...lesson.registers] : [0, 0, 0, 0],
    memory: { 0x80: 0, 0x84: 0, 0x88: 0, 0x8c: 0, ...lesson.memory },
    equalFlag: false,
    phase: "locate",
    status: "ready",
    cycle: 0,
    message: "Stepを押して、PCが最初の命令を指すところから始めましょう。",
    transfer: null,
    pendingResult: null,
    pendingTarget: null,
    branchTaken: false,
    programLines,
    program: parseProgram(programLines),
    history: [],
  };
}

const nextWithHistory = (state: CpuState): CpuState => ({
  ...state,
  ir: state.ir ? { ...state.ir, args: [...state.ir.args] } : null,
  registers: [...state.registers],
  memory: { ...state.memory },
  cycle: state.cycle + 1,
  history: [...state.history.slice(-511), snapshot(state)],
});

export function stepCpu(state: CpuState): CpuState {
  if (state.status !== "ready") return state;
  const next = nextWithHistory(state);
  const current = state.program.instructions.find((item) => item.address === state.pc);

  if (state.phase === "locate") {
    if (!current) {
      return {
        ...next,
        phase: "fault",
        status: "fault",
        message: `${hex(state.pc)}には実行できる命令がありません。`,
        transfer: { from: "PC", to: "PROGRAM", value: hex(state.pc), kind: "fault" },
      };
    }
    return {
      ...next,
      phase: "fetch",
      message: `PCが${hex(state.pc)}の命令を指しています。`,
      transfer: { from: "PC", to: "PROGRAM", value: hex(state.pc), kind: "control" },
    };
  }

  if (state.phase === "fetch") {
    if (!current) return { ...next, phase: "fault", status: "fault", message: "命令を取得できません。" };
    return {
      ...next,
      ir: current,
      phase: "decode",
      message: `${current.source.trim()} をプログラムからIRへ取り出しました。`,
      transfer: { from: "PROGRAM", to: "IR", value: current.op, kind: "control" },
    };
  }

  const instruction = state.ir;
  if (!instruction) {
    return { ...next, phase: "fault", status: "fault", message: "IRに命令がありません。" };
  }

  if (state.phase === "decode") {
    if (!instruction.valid || instruction.op === "INVALID") {
      return {
        ...next,
        phase: "fault",
        status: "fault",
        message: instruction.error ?? "この命令は、このCPUでは定義されていません。",
        transfer: { from: "IR", to: "Decoder", value: instruction.bits || "?", kind: "fault" },
      };
    }
    const direct = ["LOADI", "JMP", "JE", "JNE", "HALT"].includes(instruction.op);
    return {
      ...next,
      phase: direct ? "execute" : "read",
      message: `Decoderが${instruction.op}を見て、使う回路を決めました。`,
      transfer: { from: "IR", to: "Decoder", value: instruction.bits.slice(0, 4), kind: "control" },
    };
  }

  const [a = 0, b = 0, c = 0] = instruction.args;
  if (state.phase === "read") {
    if (["ADD", "SUB"].includes(instruction.op)) {
      return {
        ...next,
        phase: "execute",
        message: `${reg(b)}の${state.registers[b]}と${reg(c)}の${state.registers[c]}をALUへ送りました。`,
        transfer: { from: `${reg(b)}・${reg(c)}`, to: "ALU", value: `${state.registers[b]}, ${state.registers[c]}`, kind: "data" },
      };
    }
    if (instruction.op === "CMP") {
      return {
        ...next,
        phase: "execute",
        message: `${reg(a)}の${state.registers[a]}と${b}を比較回路へ送りました。`,
        transfer: { from: reg(a), to: "ALU", value: `${state.registers[a]} ? ${b}`, kind: "data" },
      };
    }
    if (instruction.op === "LOAD") {
      return {
        ...next,
        phase: "execute",
        message: `Memory[${hex(b)}]の${state.memory[b] ?? 0}をCPUへ読み出しました。`,
        transfer: { from: `Memory ${hex(b)}`, to: "CPU", value: String(state.memory[b] ?? 0), kind: "data" },
      };
    }
    if (instruction.op === "STORE") {
      return {
        ...next,
        phase: "execute",
        message: `${reg(a)}の${state.registers[a]}をメモリへ送る準備をしました。`,
        transfer: { from: reg(a), to: "Memory", value: String(state.registers[a]), kind: "data" },
      };
    }
  }

  if (state.phase === "execute") {
    if (instruction.op === "HALT") {
      return {
        ...next,
        phase: "halted",
        status: "halted",
        message: "HALTを実行しました。この学習用CPUは停止しています。",
        transfer: { from: "Decoder", to: "CPU", value: "HALT", kind: "control" },
      };
    }
    if (instruction.op === "LOADI") {
      return {
        ...next,
        phase: "writeback",
        pendingResult: b,
        message: `即値${b}を${reg(a)}へ入れる準備をしました。`,
        transfer: { from: "命令の値", to: reg(a), value: String(b), kind: "data" },
      };
    }
    if (instruction.op === "LOAD") {
      const value = state.memory[b] ?? 0;
      return { ...next, phase: "writeback", pendingResult: value, message: `${value}を${reg(a)}へ渡します。`, transfer: { from: "CPU", to: reg(a), value: String(value), kind: "data" } };
    }
    if (instruction.op === "STORE") {
      return { ...next, phase: "writeback", pendingResult: state.registers[a], message: `${state.registers[a]}を${hex(b)}へ書き込みます。`, transfer: { from: reg(a), to: `Memory ${hex(b)}`, value: String(state.registers[a]), kind: "data" } };
    }
    if (["ADD", "SUB"].includes(instruction.op)) {
      const raw = instruction.op === "ADD" ? state.registers[b] + state.registers[c] : state.registers[b] - state.registers[c];
      const value = ((raw % 256) + 256) % 256;
      return { ...next, phase: "writeback", pendingResult: value, message: `ALUが${state.registers[b]} ${instruction.op === "ADD" ? "+" : "−"} ${state.registers[c]}を計算し、${value}になりました。`, transfer: { from: "ALU", to: reg(a), value: String(value), kind: "data" } };
    }
    if (instruction.op === "CMP") {
      const equal = state.registers[a] === b;
      return { ...next, phase: "writeback", equalFlag: equal, message: `${state.registers[a]}と${b}は${equal ? "同じ" : "違う"}ため、Equalフラグを${equal ? "ON" : "OFF"}にします。`, transfer: { from: "ALU", to: "Equal", value: equal ? "ON" : "OFF", kind: "write" } };
    }
    if (["JMP", "JE", "JNE"].includes(instruction.op)) {
      const taken = instruction.op === "JMP" || (instruction.op === "JE" && state.equalFlag) || (instruction.op === "JNE" && !state.equalFlag);
      return { ...next, phase: "writeback", pendingTarget: taken ? a : null, branchTaken: taken, message: taken ? `条件が合ったため、PCを${hex(a)}へ移します。` : "条件が合わないため、次の命令へ進みます。", transfer: { from: "Decoder", to: "PC", value: taken ? hex(a) : hex(state.pc + 4), kind: "control" } };
    }
  }

  if (state.phase === "writeback") {
    const registers = [...state.registers];
    const memory = { ...state.memory };
    let message = "結果を保存しました。";
    let transfer = state.transfer;
    if (["LOAD", "LOADI", "ADD", "SUB"].includes(instruction.op) && state.pendingResult !== null) {
      registers[a] = state.pendingResult;
      message = `${state.pendingResult}を${reg(a)}へ保存しました。`;
      transfer = { from: instruction.op === "LOAD" ? "Memory" : instruction.op === "LOADI" ? "命令" : "ALU", to: reg(a), value: String(state.pendingResult), kind: "write" };
    } else if (instruction.op === "STORE" && state.pendingResult !== null) {
      memory[b] = state.pendingResult;
      message = `${state.pendingResult}をMemory[${hex(b)}]へ保存しました。`;
      transfer = { from: reg(a), to: `Memory ${hex(b)}`, value: String(state.pendingResult), kind: "write" };
    } else if (instruction.op === "CMP") {
      message = `比較結果「${state.equalFlag ? "同じ" : "違う"}」を次のジャンプで使えます。`;
    } else if (["JMP", "JE", "JNE"].includes(instruction.op)) {
      message = state.branchTaken ? `PCの行き先を${hex(state.pendingTarget ?? a)}に決めました。` : "PCは順番どおり次へ進みます。";
    }
    return { ...next, registers, memory, phase: "advance", message, transfer };
  }

  if (state.phase === "advance") {
    const destination = state.pendingTarget ?? ((state.pc + 4) & 0xff);
    return {
      ...next,
      pc: destination,
      phase: "locate",
      pendingResult: null,
      pendingTarget: null,
      branchTaken: false,
      message: `PCが${hex(destination)}へ移り、次の命令を待っています。`,
      transfer: { from: "PC", to: "次の命令", value: hex(destination), kind: "control" },
    };
  }

  return next;
}

export function restoreSnapshot(state: CpuState): CpuState {
  const previous = state.history.at(-1);
  if (!previous) return state;
  return {
    ...state,
    ...previous,
    registers: [...previous.registers],
    memory: { ...previous.memory },
    history: state.history.slice(0, -1),
  };
}

export function updateProgram(state: CpuState, programLines: string[]): CpuState {
  return {
    ...state,
    programLines,
    program: parseProgram(programLines),
    ir: null,
    phase: "locate",
    status: "ready",
    message: "プログラムを更新しました。Stepで実行できます。",
    transfer: null,
    pendingResult: null,
    pendingTarget: null,
    branchTaken: false,
    history: [],
  };
}

export function formatBits(bits: string) {
  return bits.match(/.{1,4}/g)?.join(" ") ?? bits;
}

export function formatHex(value: number) {
  return hex(value & 0xff);
}
