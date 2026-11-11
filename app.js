/* app.js — reads the CSV files and puts the numbers on the page.
 * All of the finance math lives in ccc.js. This file only loads data and
 * writes HTML, so the math can be checked separately with Node. */
'use strict';

var C = window.CCC;

/* Load both CSV files with relative paths, so the app works the same on your
 * machine and at https://<username>.github.io/<repository>/. */
function loadText(path) {
  return fetch(path, { cache: 'no-store' }).then(function (response) {
    if (!response.ok) throw new Error(path + ' could not be loaded (' + response.status + ')');
    return response.text();
  });
}

function setStatus(message, isError) {
  var el = document.getElementById('status');
  el.textContent = message;
  el.className = isError ? 'status error' : 'status';
  el.hidden = false;
}

function cell(text, className) {
  var td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function headCell(text, note) {
  var th = document.createElement('th');
  th.scope = 'row';
  th.textContent = text;
  if (note) {
    var span = document.createElement('span');
    span.className = 'item-note';
    span.textContent = note;
    th.appendChild(span);
  }
  return th;
}

function row(cells) {
  var tr = document.createElement('tr');
  cells.forEach(function (c) { tr.appendChild(c); });
  return tr;
}

/* A change in days: fewer days is good for DIO, DSO and the cycle; more days
 * is good for DPO. Colour it accordingly. */
function changeClass(change, moreIsBetter) {
  if (Math.abs(change) < 0.005) return '';
  var good = moreIsBetter ? change > 0 : change < 0;
  return good ? 'down' : 'up';
}

function signedDays(change) {
  return (change > 0 ? '+' : '') + C.formatDays(change);
}

function renderDays(before, after, assumptions) {
  var b = C.periodMetrics(before, assumptions);
  var a = C.periodMetrics(after, assumptions);

  var rows = [
    ['Days inventory outstanding (DIO)', 'Inventory / COGS x ' + assumptions.days_in_year, b.dio, a.dio, false],
    ['Days sales outstanding (DSO)', 'Receivables / revenue x ' + assumptions.days_in_year, b.dso, a.dso, false],
    ['Days payable outstanding (DPO)', 'Payables / COGS x ' + assumptions.days_in_year, b.dpo, a.dpo, true],
    ['Cash conversion cycle', 'DIO + DSO - DPO', b.ccc, a.ccc, false]
  ];

  var body = document.querySelector('#days-table tbody');
  body.textContent = '';
  rows.forEach(function (r) {
    var change = r[3] - r[2];
    var tr = row([
      headCell(r[0], r[1]),
      cell(C.formatDays(r[2])),
      cell(C.formatDays(r[3])),
      cell(signedDays(change), changeClass(change, r[4]))
    ]);
    if (r[0] === 'Cash conversion cycle') tr.className = 'total';
    body.appendChild(tr);
  });

  document.getElementById('days-note').textContent =
    'A dollar was tied up in operations for ' + C.formatDays(b.ccc) +
    ' days before the changes and ' + C.formatDays(a.ccc) + ' days after, ' +
    C.formatDays(b.ccc - a.ccc) + ' days fewer.';
}

function renderCash(before, after, assumptions) {
  var fromBalances = C.cashFreed(before, after);
  var fromDays = C.cashFreedFromDays(before, after, assumptions);

  var rows = [
    ['Carry less inventory', 'Inventory', before.inventory, after.inventory, fromBalances.inventory, fromDays.inventory],
    ['Collect faster', 'Accounts receivable', before.accounts_receivable, after.accounts_receivable, fromBalances.receivables, fromDays.receivables],
    ['Pay suppliers later', 'Accounts payable', before.accounts_payable, after.accounts_payable, fromBalances.payables, fromDays.payables]
  ];

  var body = document.querySelector('#cash-table tbody');
  body.textContent = '';
  rows.forEach(function (r) {
    body.appendChild(row([
      headCell(r[0], r[1] + ': ' + C.formatDollars(r[2]) + ' to ' + C.formatDollars(r[3])),
      cell(signedDollars(r[3] - r[2])),
      cell(C.formatDollars(r[4]), r[4] >= 0 ? 'down' : 'up'),
      cell(C.formatDollars(r[5]))
    ]));
  });

  var total = row([
    headCell('Total cash freed'),
    cell(''),
    cell(C.formatDollars(fromBalances.total)),
    cell(C.formatDollars(fromDays.total))
  ]);
  total.className = 'total';
  body.appendChild(total);
}

function signedDollars(value) {
  var text = C.formatDollars(Math.abs(value));
  return (value < 0 ? '-' : '+') + text;
}

/* The CFO's second question: where did the freed cash go? Read it off the
 * balance sheet — the bank line came down and the cash balance went up. */
function renderUses(before, after) {
  var freed = C.cashFreed(before, after);
  var bankPaydown = before.notes_payable - after.notes_payable;
  var cashKept = after.cash - before.cash;

  var body = document.querySelector('#uses-table tbody');
  body.textContent = '';
  body.appendChild(row([
    headCell('Paid down the bank line', 'Notes payable: ' + C.formatDollars(before.notes_payable) + ' to ' + C.formatDollars(after.notes_payable)),
    cell(C.formatDollars(bankPaydown))
  ]));
  body.appendChild(row([
    headCell('Kept as cash', 'Cash: ' + C.formatDollars(before.cash) + ' to ' + C.formatDollars(after.cash)),
    cell(C.formatDollars(cashKept))
  ]));
  var total = row([headCell('Total'), cell(C.formatDollars(bankPaydown + cashKept))]);
  total.className = 'total';
  body.appendChild(total);

  if (Math.abs(bankPaydown + cashKept - freed.total) > 0.5) {
    var warn = row([headCell('Note'), cell('Uses do not match the cash freed. Check data/electromart.csv.')]);
    body.appendChild(warn);
  }
}

/* ---------- the lever panel ---------- */

/* step="any" keeps the exact value we set, so Set to Before and Set to After
 * show the same days as the table above instead of snapping to whole days. */
var LEVERS = [
  { key: 'dio', label: 'Days inventory outstanding (DIO)', max: 120, formula: 'Inventory = DIO x COGS / 365' },
  { key: 'dso', label: 'Days sales outstanding (DSO)', max: 90, formula: 'Receivables = DSO x revenue / 365' },
  { key: 'dpo', label: 'Days payable outstanding (DPO)', max: 120, formula: 'Payables = DPO x COGS / 365' }
];

var sliders = {};

function buildLevers(onChange) {
  var host = document.getElementById('levers');
  host.textContent = '';

  LEVERS.forEach(function (lever) {
    var wrap = document.createElement('div');
    wrap.className = 'lever';

    var head = document.createElement('div');
    head.className = 'lever-head';

    var label = document.createElement('label');
    label.setAttribute('for', lever.key + '-slider');
    label.textContent = lever.label;

    var out = document.createElement('output');
    out.id = lever.key + '-value';

    head.appendChild(label);
    head.appendChild(out);

    var input = document.createElement('input');
    input.type = 'range';
    input.id = lever.key + '-slider';
    input.min = '0';
    input.max = String(lever.max);
    input.step = 'any';
    input.addEventListener('input', onChange);

    var formula = document.createElement('span');
    formula.className = 'formula';
    formula.textContent = lever.formula;

    wrap.appendChild(head);
    wrap.appendChild(input);
    wrap.appendChild(formula);
    host.appendChild(wrap);

    sliders[lever.key] = { input: input, output: out };
  });
}

function readSliders() {
  return {
    dio: Number(sliders.dio.input.value),
    dso: Number(sliders.dso.input.value),
    dpo: Number(sliders.dpo.input.value)
  };
}

function writeSliders(days) {
  sliders.dio.input.value = days.dio;
  sliders.dso.input.value = days.dso;
  sliders.dpo.input.value = days.dpo;
}

function renderLevers(before, assumptions) {
  var days = readSliders();
  var s = C.leverSummary(days, before, assumptions);
  var beforeDays = C.periodMetrics(before, assumptions);

  LEVERS.forEach(function (lever) {
    sliders[lever.key].output.textContent = C.formatDays(days[lever.key]) + ' days';
  });

  /* 1. the new cash conversion cycle */
  var vsBefore = s.days.ccc - beforeDays.ccc;
  document.getElementById('ccc-live').textContent =
    'Cash conversion cycle: ' + C.formatDays(s.days.ccc) + ' days  (' +
    C.formatDays(s.days.dio) + ' + ' + C.formatDays(s.days.dso) + ' − ' +
    C.formatDays(s.days.dpo) + ')  ·  ' +
    (Math.abs(vsBefore) < 0.005
      ? 'the same as Before'
      : C.formatDays(Math.abs(vsBefore)) + ' days ' +
        (vsBefore < 0 ? 'shorter' : 'longer') + ' than Before');

  /* 2. the balances those days imply, and 3. the cash freed */
  var rows = [
    ['Inventory', s.balances.inventory, before.inventory, s.freed.inventory],
    ['Receivables', s.balances.receivables, before.accounts_receivable, s.freed.receivables],
    ['Payables', s.balances.payables, before.accounts_payable, s.freed.payables]
  ];

  var body = document.querySelector('#lever-table tbody');
  body.textContent = '';
  rows.forEach(function (r) {
    body.appendChild(row([
      headCell(r[0]),
      cell(C.formatDollars(r[1])),
      cell(C.formatDollars(r[2])),
      cell(C.formatDollars(r[3]), r[3] >= 0 ? 'down' : 'up')
    ]));
  });
  var total = row([
    headCell('Total cash freed'),
    cell(''),
    cell(''),
    cell(C.formatDollars(s.freed.total), s.freed.total >= 0 ? 'down' : 'up')
  ]);
  total.className = 'total';
  body.appendChild(total);

  /* 4. interest saved, and 5. the supplier terms */
  var extras = document.querySelector('#lever-extras tbody');
  extras.textContent = '';

  extras.appendChild(row([
    headCell('Interest saved each year',
      'Assumes every freed dollar pays down the bank line, capped at its Before balance of ' +
      C.formatDollars(before.notes_payable) + ' at ' + C.formatPercent(assumptions.bank_rate) +
      '. The case’s own balance sheet shows part of the cash was kept instead.'),
    cell(C.formatDollars(s.interestSaved), s.interestSaved >= 0 ? 'down' : 'up')
  ]));

  extras.appendChild(row([
    headCell('Days paid past the due date',
      'DPO − net ' + assumptions.net_days + ', never below zero'),
    cell(C.formatDays(s.daysPastDue) + ' days')
  ]));

  if (s.discount.takesDiscount) {
    extras.appendChild(row([
      headCell('Supplier discount',
        'Paying within ' + assumptions.discount_days + ' days earns the ' +
        C.formatPercent(assumptions.supplier_discount) + ' discount'),
      cell('Taken')
    ]));
  } else {
    extras.appendChild(row([
      headCell('Annual cost of skipping the discount',
        C.formatPercent(assumptions.supplier_discount) + ' / (1 − ' +
        C.formatPercent(assumptions.supplier_discount) + ') × ' +
        assumptions.days_in_year + ' / (' + C.formatDays(s.days.dpo) + ' − ' +
        assumptions.discount_days + ')'),
      cell(C.formatPercent(s.discount.costOfSkipping), 'up')
    ]));
  }
}

function renderAssumptions(assumptions) {
  var list = document.getElementById('assumptions-list');
  list.textContent = '';
  var lines = [
    'Days in the year: ' + assumptions.days_in_year + ' (the class slides use 360)',
    'Bank line of credit rate: ' + C.formatPercent(assumptions.bank_rate) + ' a year',
    'Supplier terms: ' + C.formatPercent(assumptions.supplier_discount) + ' discount within ' +
      assumptions.discount_days + ' days, net ' + assumptions.net_days,
    'All sales are on credit, and purchases equal COGS'
  ];
  lines.forEach(function (text) {
    var li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  });
}

function start() {
  Promise.all([
    loadText('data/electromart.csv'),
    loadText('data/assumptions.csv')
  ]).then(function (texts) {
    var statements = C.parseStatements(texts[0]);
    var assumptions = C.parseAssumptions(texts[1]);

    renderDays(statements.before, statements.after, assumptions);
    renderCash(statements.before, statements.after, assumptions);
    renderUses(statements.before, statements.after);
    renderAssumptions(assumptions);

    var beforeDays = C.periodMetrics(statements.before, assumptions);
    var afterDays = C.periodMetrics(statements.after, assumptions);
    var update = function () { renderLevers(statements.before, assumptions); };

    buildLevers(update);
    document.getElementById('set-before').addEventListener('click', function () {
      writeSliders(beforeDays);
      update();
    });
    document.getElementById('set-after').addEventListener('click', function () {
      writeSliders(afterDays);
      update();
    });

    writeSliders(beforeDays);
    update();

    document.getElementById('status').hidden = true;
    document.getElementById('results').hidden = false;
  }).catch(function (error) {
    setStatus('Could not load the data: ' + error.message, true);
  });
}

/* Register the service worker, which is what makes the app installable and
 * able to run offline. The relative path matters: the app is served from
 * https://<username>.github.io/<repository>/, not from the root of a domain.
 * Nothing here is required for the numbers to work, so a failure is only
 * logged. Opening index.html straight off the disk has no service worker,
 * because browsers only allow them over http(s). */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function (error) {
    console.log('Service worker not registered:', error.message);
  });
}

document.addEventListener('DOMContentLoaded', start);
window.addEventListener('load', registerServiceWorker);
