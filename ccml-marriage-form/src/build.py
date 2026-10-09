"""Embed template.docx and JSZip into form.template.html -> ../index.html (single self-contained file)."""
import base64, pathlib

here = pathlib.Path(__file__).resolve().parent
b64 = base64.b64encode((here / "template.docx").read_bytes()).decode()
html = (here / "form.template.html").read_text(encoding="utf-8").replace("__DOCX_B64__", b64)
html = html.replace("/*__JSZIP__*/", (here / "jszip.min.js").read_text(encoding="utf-8"))
(here.parent / "index.html").write_text(html, encoding="utf-8")
print("wrote", here.parent / "index.html")
