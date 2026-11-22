// A fast, exact drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// It returns the same {columns, rows, errors} for every input, including
// the broken-row policy: stray CRs, unterminated quotes, quote junk, and
// short and long rows. Speed comes from jumping between delimiters with
// native indexOf instead of stepping character by character, from keeping
// each delimiter kind's next position cached as the scan moves forward,
// and from slicing whole fields (and whole clean lines) at once.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // Next index at or after pos of each delimiter kind, or Infinity when
  // there is none left. Each is refreshed lazily and only ever moves
  // forward, so the text is scanned for each kind at most once overall.
  let nc = -1;
  let nn = -1;
  let nr = -1;
  let nq = -1;

  let recordLine = 1;
  let recordRow = null;

  const err = (code) => {
    errors.push({ code, line: recordLine, row: recordRow });
  };

  // Reusable result for the rare unquoted scans (unterminated-quote
  // re-read, junk after a closing quote).
  const ru = { value: '', ended: 0, added: 0 };

  // Reads an unquoted field starting at `start`, beginning with `init`
  // already in the value. Moves pos/line past the field and fills ru with
  // the value, how it ended (0 comma, 1 line break, 2 end) and how many
  // characters this scan kept. Only used for the rare paths; the common
  // unquoted field is inlined in the record loop below.
  function scanPlain(init, start) {
    let val = init;
    let seg = start;
    let added = 0;
    pos = start;
    for (;;) {
      if (nc < pos) { nc = text.indexOf(',', pos); if (nc < 0) nc = Infinity; }
      if (nn < pos) { nn = text.indexOf('\n', pos); if (nn < 0) nn = Infinity; }
      if (nr < pos) { nr = text.indexOf('\r', pos); if (nr < 0) nr = Infinity; }
      let e = nc;
      let kind = 0;
      if (nn < e) { e = nn; kind = 1; }
      if (nr < e) { e = nr; kind = 2; }
      if (e === Infinity) {
        added += len - seg;
        ru.value = val + text.slice(seg);
        ru.added = added;
        ru.ended = 2;
        pos = len;
        return ru;
      }
      if (kind === 2 && text.charCodeAt(e + 1) !== 10) {
        err('stray_cr');
        added += e - seg;
        val += text.slice(seg, e);
        seg = e + 1;
        pos = e + 1;
        continue;
      }
      added += e - seg;
      ru.value = val + text.slice(seg, e);
      ru.added = added;
      if (kind === 0) { ru.ended = 0; pos = e + 1; return ru; }
      ru.ended = 1;
      pos = e + (kind === 1 ? 1 : 2);
      line += 1;
      return ru;
    }
  }

  for (;;) {
    // Skip lines left with no characters (LF or CRLF only).
    while (pos < len) {
      if (nn < pos) { nn = text.indexOf('\n', pos); if (nn < 0) nn = Infinity; }
      if (nn === pos) { pos += 1; line += 1; continue; }
      if (nr < pos) { nr = text.indexOf('\r', pos); if (nr < 0) nr = Infinity; }
      if (nr === pos && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; continue; }
      break;
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the rest of this physical line holds no quote and no
    // carriage return except possibly the CRLF that ends it, so it is
    // exactly one record and its fields are one native split.
    if (nq < pos) { nq = text.indexOf('"', pos); if (nq < 0) nq = Infinity; }
    const lineEnd = nn;
    const endIdx = lineEnd === Infinity ? len : lineEnd;
    if ((nq === Infinity || nq > lineEnd) && (nr === Infinity || (lineEnd !== Infinity && nr >= lineEnd - 1))) {
      const crlf = lineEnd !== Infinity && nr === lineEnd - 1;
      const fields = text.slice(pos, crlf ? lineEnd - 1 : endIdx).split(',');
      if (width < 0) width = fields.length;
      if (header && columns === null) {
        columns = fields;
      } else if (fields.length < width) {
        errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
        while (fields.length < width) fields.push('');
        rows.push(fields);
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
        rows.push(fields);
      } else {
        rows.push(fields);
      }
      pos = lineEnd === Infinity ? len : lineEnd + 1;
      line += 1;
      continue;
    }

    // Careful path: at least one quote or stray CR on this line.
    const fields = [];
    let quoted = false;
    let fvalue = '';
    let fended = 0;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (!quoted) {
        // Unquoted field, inlined for speed.
        let fval = '';
        let fseg = pos;
        for (;;) {
          if (nc < pos) { nc = text.indexOf(',', pos); if (nc < 0) nc = Infinity; }
          if (nn < pos) { nn = text.indexOf('\n', pos); if (nn < 0) nn = Infinity; }
          if (nr < pos) { nr = text.indexOf('\r', pos); if (nr < 0) nr = Infinity; }
          let e = nc;
          let kind = 0;
          if (nn < e) { e = nn; kind = 1; }
          if (nr < e) { e = nr; kind = 2; }
          if (e === Infinity) {
            fvalue = fval === '' ? text.slice(fseg) : fval + text.slice(fseg);
            pos = len;
            fended = 2;
            break;
          }
          if (kind === 2 && text.charCodeAt(e + 1) !== 10) {
            err('stray_cr');
            fval += text.slice(fseg, e);
            fseg = e + 1;
            pos = e + 1;
            continue;
          }
          fvalue = fval === '' ? text.slice(fseg, e) : fval + text.slice(fseg, e);
          if (kind === 0) { pos = e + 1; fended = 0; }
          else { pos = e + (kind === 1 ? 1 : 2); line += 1; fended = 1; }
          break;
        }
      } else {
        // Quoted field: jump from quote to quote.
        const open = pos;
        const openLine = line;
        pos = open + 1;
        let seg = pos;
        let val = '';
        let closed = false;
        for (;;) {
          if (nq < pos) { nq = text.indexOf('"', pos); if (nq < 0) nq = Infinity; }
          if (nq === Infinity) break;
          const q = nq;
          if (nr < pos) { nr = text.indexOf('\r', pos); if (nr < 0) nr = Infinity; }
          if (nn < pos) { nn = text.indexOf('\n', pos); if (nn < 0) nn = Infinity; }
          if (nr < q || nn < q) {
            // The stretch before this quote holds a line break: each CRLF
            // or lone CR inside quotes reads as one LF.
            const chunk = text.slice(seg, q);
            const conv = chunk.replace(/\r\n|\r/g, '\n');
            // Count the line breaks without building a split array.
            let lb = 0;
            let from = 0;
            for (;;) {
              const nl = conv.indexOf('\n', from);
              if (nl < 0) break;
              lb += 1;
              from = nl + 1;
            }
            line += lb;
            val += conv;
          } else {
            val += text.slice(seg, q);
          }
          if (text.charCodeAt(q + 1) === 34) {
            val += '"';
            pos = q + 2;
            seg = pos;
            continue;
          }
          pos = q + 1;
          closed = true;
          break;
        }
        if (!closed) {
          // The quote never closes: it is a literal character, and the
          // text after it is read again as unquoted. The scan jumps back,
          // so the delimiter caches must be rebuilt from the new pos.
          pos = open + 1;
          line = openLine;
          nc = -1;
          nn = -1;
          nr = -1;
          nq = -1;
          err('unterminated_quote');
          scanPlain('"', pos);
          fvalue = ru.value;
          fended = ru.ended;
        } else if (pos >= len) {
          fvalue = val;
          fended = 2;
        } else {
          const c = text.charCodeAt(pos);
          if (c === 44) { pos += 1; fvalue = val; fended = 0; }
          else if (c === 10) { pos += 1; line += 1; fvalue = val; fended = 1; }
          else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; fvalue = val; fended = 1; }
          else {
            // What follows the closing quote is appended as it stands.
            scanPlain(val, pos);
            if (ru.added > 0) err('quote_junk');
            fvalue = ru.value;
            fended = ru.ended;
          }
        }
      }
      fields.push(fvalue);
    } while (fended === 0);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
