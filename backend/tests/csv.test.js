const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv } = require("../scripts/lib/csv");

test("strips a leading BOM and splits simple rows", () => {
  assert.deepEqual(parseCsv("﻿a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
});

test("quoted field keeps commas and doubled quotes; CRLF ends the row", () => {
  assert.deepEqual(parseCsv('x,"he said ""hi"", ok",z\r\n'), [["x", 'he said "hi", ok', "z"]]);
});

test("quoted field keeps a newline; last row without trailing newline", () => {
  assert.deepEqual(parseCsv('a,"line1\nline2",c'), [["a", "line1\nline2", "c"]]);
});

test("empty fields are kept", () => {
  assert.deepEqual(parseCsv("a,,\n"), [["a", "", ""]]);
});
