import factorial from "./factorial.asm?raw";
import hello from "./hello.asm?raw";
import macros from "./macros.asm?raw";
import reverse from "./reverse.asm?raw";
import sort from "./sort.asm?raw";
import sum from "./sum.asm?raw";
import upper from "./upper.asm?raw";
import video from "./video.asm?raw";

export const EXAMPLE_IDS = ["hello", "factorial", "sum", "sort", "reverse", "video", "upper", "macros"] as const;
export type ExampleId = (typeof EXAMPLE_IDS)[number];

export interface Example {
  id: ExampleId;
  title: string;
  file: string;
  src: string;
}

export const EXAMPLES: Readonly<Record<ExampleId, Example>> = {
  hello: { id: "hello", title: "Hello, world", file: "hello.asm", src: hello },
  factorial: { id: "factorial", title: "Factorial of 5", file: "fact.asm", src: factorial },
  sum: { id: "sum", title: "Sum of an array (EXE)", file: "sum.asm", src: sum },
  sort: { id: "sort", title: "Bubble sort (MASM segments)", file: "sort.asm", src: sort },
  reverse: { id: "reverse", title: "Reverse a string", file: "reverse.asm", src: reverse },
  video: { id: "video", title: "Paint video memory", file: "video.asm", src: video },
  upper: { id: "upper", title: "Uppercase as you type", file: "upper.asm", src: upper },
  macros: { id: "macros", title: "Add two numbers (emu8086.inc)", file: "add.asm", src: macros }
};

export const isExampleId = (value: string): value is ExampleId => (EXAMPLE_IDS as readonly string[]).includes(value);
