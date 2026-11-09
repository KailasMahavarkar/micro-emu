import { Download01Icon, Link01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { useRef } from "react";
import { COPY } from "../../i18n/copy.ts";
import { usePrefs } from "../../session/prefs.ts";
import { useSession } from "../../session/store.ts";
import { CUSTOM_PROGRAM } from "../../session/types.ts";
import { Button, Panel, PanelHeader } from "../../ui/index.ts";
import { shareUrl } from "../share/share.ts";
import { NextBar } from "./next-bar.tsx";
import { ProblemBox } from "./problem-box.tsx";
import { SourceEditor } from "./source-editor.tsx";

const MODE_HINT = { com: ".COM program, ORG 100h", exe: ".EXE program, segments" } as const;
const OPEN_TYPES = ".asm,.txt,.s,.inc";
const REVOKE_AFTER_MS = 1000;

export function EditorPanel() {
  const fileName = useSession(s => s.fileName);
  const mode = useSession(s => s.program.mode);
  const open = useSession(s => s.open);
  const showToast = useSession(s => s.showToast);
  const lang = usePrefs(s => s.lang);
  const fileRef = useRef<HTMLInputElement>(null);

  const share = async (): Promise<void> => {
    const url = shareUrl(window.location.href, useSession.getState().source);
    try {
      await navigator.clipboard.writeText(url);
      showToast(COPY[lang].linkCopied);
    } catch {
      window.history.replaceState(null, "", url);
      showToast(COPY[lang].linkInBar);
    }
  };

  const download = (): void => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([useSession.getState().source], { type: "text/plain" }));
    link.download = fileName;
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); }, REVOKE_AFTER_MS);
  };

  return (
    <Panel className="h-full">
      <PanelHeader title={fileName}>
        <span className="ml-auto text-xs font-normal whitespace-nowrap text-muted">{MODE_HINT[mode]}</span>
        <span className="ml-2 flex gap-0.5">
          <Button variant="ghost" size="icon" icon={Upload01Icon} aria-label="Open file" title="Open an .asm file" onClick={() => fileRef.current?.click()} />
          <Button variant="ghost" size="icon" icon={Download01Icon} aria-label="Download program" title="Download this program" onClick={download} />
          <Button variant="ghost" size="icon" icon={Link01Icon} aria-label="Copy share link" title="Copy a link to this program" onClick={() => { void share(); }} />
        </span>
        <input
          ref={fileRef}
          type="file"
          accept={OPEN_TYPES}
          hidden
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void file.text().then(text => { open(CUSTOM_PROGRAM, text, file.name); });
          }}
        />
      </PanelHeader>
      <SourceEditor />
      <ProblemBox />
      <NextBar />
    </Panel>
  );
}
