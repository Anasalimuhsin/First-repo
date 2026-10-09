# CCML – Marriage contract form (وثيقة عقد زواج شرعي)

`index.html` is a self-contained page (works offline, no install). Open it in any browser and fill in the fields, then:

- **تحميل ملف Word المعبأ**: downloads the mosque's original Word form with every field filled in.
- **طباعة / PDF**: prints a one-page A4 copy, or saves it as PDF.

Drafts are auto-saved in the browser on that computer. Signatures and the stamp are left blank to be signed by hand.

## Editing

- `src/form.template.html`: the page source
- `src/template.docx`: the original Word form that gets filled in
- `src/jszip.min.js`: JSZip 3.10.1 (MIT), used to edit the .docx in the browser

After changing any of these files, rebuild `index.html`:

```
python3 ccml-marriage-form/src/build.py
```
