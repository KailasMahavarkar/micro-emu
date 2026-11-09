import { ArrowExpand01Icon, Cancel01Icon, ComputerIcon, KeyboardIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { COPY } from "../../i18n/copy.ts";
import { usePrefs } from "../../session/prefs.ts";
import { machine, useSession } from "../../session/store.ts";
import { Button, Panel, PanelHeader } from "../../ui/index.ts";
import { Crt } from "./crt.tsx";

const MODAL_HINT = "80 x 25 text mode. Type here to send keys to the program.";

function ScreenModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full size screen"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 grid place-items-center bg-[rgb(5_8_12/0.72)]"
    >
      <div className="flex flex-col gap-2 rounded-2xl bg-modal-frame p-3.5 shadow-[0_30px_80px_rgb(0_0_0/0.6)]">
        <div className="flex items-center gap-2 text-xs text-dos-muted">
          <HugeiconsIcon icon={KeyboardIcon} size={16} />
          <span>{MODAL_HINT}</span>
          <Button variant="dark-ghost" size="icon" icon={Cancel01Icon} aria-label="Close" className="ml-auto" onClick={onClose} />
        </div>
        <Crt fit="modal" onEscape={onClose} label="Program screen, full size" />
      </div>
    </div>
  );
}

export function ScreenPanel() {
  const lang = usePrefs(s => s.lang);
  useSession(s => s.tick);
  const [expanded, setExpanded] = useState(false);
  const copy = COPY[lang];
  return (
    <Panel tone="dark">
      <PanelHeader tone="dark" icon={ComputerIcon} title="Screen">
        <span className="ml-auto text-xs font-normal whitespace-nowrap text-dos-muted">{machine.isWaiting() ? copy.waitingHint : copy.screenMode}</span>
        <Button variant="dark-ghost" size="icon" icon={ArrowExpand01Icon} aria-label="Open full size screen" title="Full size screen" className="ml-2" onClick={() => { setExpanded(true); }} />
      </PanelHeader>
      <Crt fit="panel" label="Program screen. Click and type to send keys." />
      {expanded && <ScreenModal onClose={() => { setExpanded(false); }} />}
    </Panel>
  );
}
