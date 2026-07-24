// Generates test-fixtures/sample.docx — a REAL OOXML Word document (not a stub)
// used by the DOCX→DocModel automated test. No Word/LibreOffice required, so it
// runs in CI. Same precedent as scripts/generate_photo_heavy_pdf.mjs.
//
//   node scripts/generate_docx_fixture.mjs
//
// The document uses genuine Word "Heading 1"/"Heading 2" paragraph styles so
// mammoth maps them to <h1>/<h2> (proving structure survives, not just text).

import { zipSync, strToU8 } from 'fflate';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
</w:styles>`;

const heading = (style, text) =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const para = (text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${heading('Heading1', 'Quarterly Report')}
${para('This is the introduction paragraph of the report.')}
${heading('Heading2', 'Overview')}
${para('Overview details go here.')}
${heading('Heading1', 'Financials')}
${para('Financial summary paragraph.')}
</w:body>
</w:document>`;

const zip = zipSync({
  '[Content_Types].xml': strToU8(contentTypes),
  '_rels/.rels': strToU8(rootRels),
  'word/document.xml': strToU8(document),
  'word/styles.xml': strToU8(styles),
  'word/_rels/document.xml.rels': strToU8(docRels),
});

const out = join(process.cwd(), 'test-fixtures', 'sample.docx');
writeFileSync(out, zip);
console.log(`sample.docx  ${zip.byteLength} bytes  → ${out}`);
