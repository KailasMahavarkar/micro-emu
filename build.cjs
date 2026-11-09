const fs = require("fs"), path = require("path");
const src = f => fs.readFileSync(path.join(__dirname, "src", f), "utf8");
const font = f => fs.readFileSync(path.join(__dirname, "src", "fonts", f)).toString("base64");
const parts = {
  STYLE: src("style.css").replace("{{FONT_GEIST}}", () => font("geist-var-latin.ttf")).replace("{{FONT_GEIST_MONO}}", () => font("geist-mono-var-latin.ttf")),
  ICONS: src("icons.svg"),
  CORE: src("core.js"),
  EXAMPLES: src("examples.js"),
  APP: src("app.js")
};
for (const [k, v] of Object.entries(parts)) if (/<\/(script|style)/i.test(v)) throw new Error(`${k} contains a closing tag`);
const html = src("shell.html").replace(/\{\{(STYLE|ICONS|CORE|EXAMPLES|APP)\}\}/g, (_, k) => parts[k]);
fs.writeFileSync(path.join(__dirname, "index.html"), html);
console.log(`index.html ${(html.length / 1024).toFixed(0)} KB`);
