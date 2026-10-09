# CCML – Marriage contract form (وثيقة عقد زواج شرعي)

`index.html` is a self-contained page (works offline, no install). Open it in any browser, fill in the fields and add photos of the ID cards (front and back) for the husband, the wife and the two witnesses. Then:

- **تحميل النسختين (Word)**: downloads two filled copies of the mosque's original Word form:
  - `..._copie_mosquee.docx`: the mosque copy, with an extra page of ID photos
  - `..._copie_epoux.docx`: the couple's copy to take home, with no ID photos
- **طباعة نسخة المسجد / طباعة نسخة الزوجين**: prints either copy (or saves it as PDF).

Each copy is labelled (نسخة المسجد / نسخة الزوجين). Text fields are auto-saved as a draft in the browser on that computer. ID photos are never saved or sent anywhere, so add them again if the page is reloaded. Signatures and the stamp are left blank to be signed by hand.

## Editing

- `src/form.template.html`: the page source
- `src/template.docx`: the original Word form that gets filled in
- `src/jszip.min.js`: JSZip 3.10.1 (MIT), used to edit the .docx in the browser

After changing any of these files, rebuild `index.html`:

```
python3 ccml-marriage-form/src/build.py
```
