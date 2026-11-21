// Fast CSV reader — an exact, faster drop-in for csv-reader 1.0.0.
//
// Written fresh from the written policy in the competition kit: the same
// answers for every input, reached by jumps instead of one character at a
// time. Unquoted fields are taken as whole slices up to the next comma or
// line break; quoted fields jump from quote to quote; whole lines with no
// quote and no stray carriage return are split natively in one go. Every
// error the policy names is still reported, in the same order, on the same
// line and row.
//
// Policy recap (in my own words): a leading U+FEFF is dropped; a record
// ends at LF or CRLF and an empty line is no record; a CR outside quotes
// that is not part of CRLF is dropped as stray_cr; a field starting with a
// quote runs to its closing quote ("" inside is one quote, CR/CRLF/LF
// inside become LF), text after the closing quote is kept as it stands
// (quote_junk if anything was kept); a quote that never closes is literal
// and the rest is re-read unquoted (unterminated_quote); a quote inside an
// unquoted field is literal; fields are never trimmed or converted;
// columns is the first record when header is true (else null, or [] when
// there are no records at all); later records are padded (short_row) or cut
// (long_row) to the first record's width.

const COMMA = 0;
const BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;

  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on, and its index in rows
  // (null while the header is being read).
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and — for the junk check
  // after a quoted field — how many characters the unquoted tail kept.
  let value = '';
  let ended = END;
  let kept = 0;

  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  // Reads an unquoted field (or the unquoted tail of a quoted one) starting
  // at pos, keeping `init` as its starting value. The next comma or line
  // break is found with native indexOf jumps, so the field is one slice;
  // any CR inside that slice is stray, except a trailing CR just before a
  // LF, which is the CRLF ending the line.
  function readPlain(init) {
    let v = init;
    let added = 0;
    ended = END;
    while (pos < n) {
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      let e = n;
      let kind = END;
      if (comma !== -1 && comma < e) { e = comma; kind = COMMA; }
      if (lf !== -1 && lf < e) { e = lf; kind = BREAK; }
      const raw = text.slice(pos, e);
      const crAt = raw.indexOf('\r');
      if (crAt === -1) {
        v += raw;
        added += raw.length;
      } else {
        // Every CR in the slice is stray, except possibly the last one when
        // the slice ends at a LF: that one is the CR of a CRLF break.
        const crlf = kind === BREAK && raw.charCodeAt(raw.length - 1) === 13;
        let strays = 0;
        let p = crAt;
        while (p !== -1) { strays++; p = raw.indexOf('\r', p + 1); }
        if (crlf) strays -= 1;
        for (let i = 0; i < strays; i++) {
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        }
        // Drop every CR from the kept text.
        if (strays > 0 || crlf) {
          v += raw.replace(/\r/g, '');
          added += raw.length - (strays + (crlf ? 1 : 0));
        } else {
          v += raw;
          added += raw.length;
        }
      }
      if (kind === COMMA) {
        pos = e + 1;
        ended = COMMA;
        break;
      }
      if (kind === BREAK) {
        pos = e + 1;
        line += 1;
        ended = BREAK;
        break;
      }
      pos = n;
      ended = END;
      break;
    }
    value = v;
    kept = added;
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let v = '';
    let cur = pos + 1;
    let close = -1;
    while (true) {
      const q = text.indexOf('"', cur);
      if (q === -1) break;
      if (q > cur) {
        const seg = text.slice(cur, q);
        const crAt = seg.indexOf('\r');
        if (crAt !== -1) {
          // CRLF and lone CR inside quotes each become one LF.
          let lfCount = 0;
          let crCount = 0;
          let crlfCount = 0;
          let p = seg.indexOf('\n');
          while (p !== -1) { lfCount++; p = seg.indexOf('\n', p + 1); }
          p = seg.indexOf('\r');
          while (p !== -1) { crCount++; p = seg.indexOf('\r', p + 1); }
          p = seg.indexOf('\r\n');
          while (p !== -1) { crlfCount++; p = seg.indexOf('\r\n', p + 1); }
          line += lfCount + crCount - crlfCount;
          v += seg.replace(/\r\n?/g, '\n');
        } else {
          const lfAt = seg.indexOf('\n');
          if (lfAt !== -1) {
            let c = 0;
            let p = lfAt;
            while (p !== -1) { c++; p = seg.indexOf('\n', p + 1); }
            line += c;
          }
          v += seg;
        }
      }
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
        // A doubled quote inside the field is one literal quote.
        v += '"';
        cur = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // No closing quote: the quote is literal, and the text after it is
      // re-read as unquoted, from just after the opening quote, with the
      // line count wound back to where the field opened.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readPlain('"');
      return;
    }
    pos = close + 1;
    if (pos >= n) {
      value = v;
      ended = END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      value = v;
      ended = COMMA;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      value = v;
      ended = BREAK;
      return;
    }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      value = v;
      ended = BREAK;
      return;
    }
    // Anything else after the closing quote is kept as it stands, up to
    // the next comma or line break.
    readPlain(v);
    if (kept > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: a whole physical line with no quote and no stray CR is a
    // plain comma-split. The check is done on the line's own slice, so a
    // quote or CR on a later line can never leak into this one. A single
    // trailing CR just before the LF is the CRLF ending, not a stray CR.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? n : nl;
    const rawLine = text.slice(pos, lineEnd);
    let fast = rawLine.indexOf('"') === -1;
    let effEnd = lineEnd;
    if (fast) {
      const crAt = rawLine.indexOf('\r');
      if (crAt !== -1) {
        if (nl !== -1 && crAt === rawLine.length - 1) {
          effEnd = lineEnd - 1;
        } else {
          fast = false;
        }
      }
    }
    if (fast) {
      const fields = text.slice(pos, effEnd).split(',');
      if (nl === -1) {
        pos = n;
      } else {
        pos = nl + 1;
        line += 1;
      }
      // A line left with no characters is no record; the empty-line skip
      // above already removes those, but a lone empty field is the same.
      if (fields.length === 1 && fields[0] === '') continue;
      finishRecord(fields);
      continue;
    }

    // Careful path: at least one field on this record needs the quoted
    // rules, a stray CR, or both.
    const fields = [];
    let lastQuoted = false;
    do {
      lastQuoted = text.charCodeAt(pos) === 34;
      if (lastQuoted) readQuoted();
      else readPlain('');
      fields.push(value);
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;
    finishRecord(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
